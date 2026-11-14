import Phaser from 'phaser';
import { SoundCue, sound } from '@/audio/SoundBoard';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { LOOT_ATLAS, LOOT_FRAMES, lootAnimationKey } from '@/config/spriteConfig';
import type { AmbientProfile } from '@/config/lightingConfig';
import type { TilesetAsset } from '@/config/tilesetConfig';
import type { DungeonFloor, Room } from '@/core/dungeonTypes';
import type { LootDrop } from '@/core/lootTypes';
import { PickupKind } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { LightingOverlay, PointLight } from '@/effects/LightingOverlay';
import { GlowGroup, screenFx } from '@/effects/ScreenFx';
import type { Enemy } from '@/entities/Enemy';
import type { Party } from '@/entities/Party';
import { diag } from '@/diagnostics/DiagnosticsHub';
import { HordePhase, isInsideRoom } from '@/systems/Horde';
import type { Bounds, RoomEventConfig, RoomEventPlan } from '@/systems/RoomEvents';
import {
  RoomEventKind,
  TorchOutcome,
  TorchRace,
  eventGold,
  purseCaughtBy,
  purseHeading,
  purseSpawnPoint,
  purseWanderTarget,
  roomBounds,
  stepPurse,
  torchLightRadius,
} from '@/systems/RoomEvents';

export interface RoomEventManagerDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  readonly party: Party;
  readonly plans: readonly RoomEventPlan[];
  readonly config: RoomEventConfig;
  /** Faza nawały pokoju — wydarzenie budzi się razem z nią. */
  readonly hordePhase: (roomId: number) => HordePhase | null;
  readonly enemies: () => readonly Enemy[];
  readonly effects: CombatEffects;
  readonly dropLoot: (at: Vector2, drops: readonly LootDrop[]) => void;
  readonly lighting: () => LightingOverlay | null;
  /** Profil mroku (jak w zasadzce): mały krąg światła bohatera. */
  readonly darkProfile: AmbientProfile;
  /** Arkusz kafli biomu: płomień pochodni z jego animacji. */
  readonly tileset: TilesetAsset;
  readonly rng: Rng;
}

/** Krok mroku: siła dąży do celu w `fadeMs` (bez twardych przejść, krok 28a). */
function approach(current: number, target: number, dtMs: number, fadeMs: number): number {
  const step = dtMs / Math.max(1, fadeMs);
  return target > current ? Math.min(target, current + step) : Math.max(target, current - step);
}

interface TorchView {
  readonly race: TorchRace;
  readonly at: Vector2;
  readonly stand: Phaser.GameObjects.Graphics;
  readonly flame: Phaser.GameObjects.Sprite;
  readonly light: { x: number; y: number; radius: number };
}

interface PurseView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly bounds: Bounds;
  at: Vector2;
  wander: Vector2;
  bornAt: number;
}

interface ActiveEvent {
  readonly plan: RoomEventPlan;
  readonly room: Room;
  woke: boolean;
  done: boolean;
  /** Mrok tego pokoju (ciemny pokój, zgasła pochodnia): bieżąca siła i cel. */
  dark: number;
  torch: TorchView | null;
  purse: PurseView | null;
  purseAt: number;
}

/**
 * Wydarzenia w pokojach (krok U8a): pochodnia na wyścig, uciekająca sakiewka i ciemny pokój. Bez napisów —
 * reguła jest widoczna w pokoju. Nagroda to złoto (wynik runu), rozsypane jak zwykły łup. Mrok idzie osobnym
 * źródłem warstwy zasadzki (`setDread(…, 'room-event')`).
 */
export class RoomEventManager {
  private readonly events: ActiveEvent[];
  private lastNow = 0;

  constructor(private readonly deps: RoomEventManagerDeps) {
    this.events = deps.plans.map((plan) => ({
      plan,
      room: deps.floor.rooms[plan.roomId]!,
      woke: false,
      done: false,
      dark: 0,
      torch: null,
      purse: null,
      purseAt: Infinity,
    }));
  }

  /** Światła wydarzeń (pochodnie wyścigu) dla oświetlenia piętra. */
  get lights(): readonly PointLight[] {
    return this.events.flatMap((e) => (e.torch && e.torch.light.radius > 0 ? [e.torch.light] : []));
  }

  update(now: number): void {
    const dt = this.lastNow === 0 ? 0 : now - this.lastNow;
    this.lastNow = now;
    let dread = 0;
    for (const event of this.events) {
      if (!event.woke) this.tryWake(event, now);
      if (!event.woke) continue;
      const cleared = this.isCleared(event);
      switch (event.plan.kind) {
        case RoomEventKind.Torch:
          this.updateTorch(event, now, cleared);
          break;
        case RoomEventKind.Purse:
          this.updatePurse(event, now, dt);
          break;
        case RoomEventKind.Dark:
          this.updateDark(event, cleared);
          break;
      }
      const target = this.darkTarget(event, cleared);
      event.dark = approach(event.dark, target, dt, this.deps.config.dark.fadeMs);
      dread = Math.max(dread, event.dark);
    }
    if (dread > 0 || this.events.some((e) => e.woke)) this.deps.lighting()?.setDread(dread, this.deps.darkProfile, 'room-event');
  }

  private tryWake(event: ActiveEvent, now: number): void {
    const phase = this.deps.hordePhase(event.room.id);
    if (phase === null || phase === HordePhase.Dormant) return;
    event.woke = true;
    diag.note('room-event', { kind: event.plan.kind, room: event.room.id, floor: this.deps.floorNumber });
    const center = { x: (event.room.x + event.room.width / 2) * TILE_SIZE, y: (event.room.y + event.room.height / 2) * TILE_SIZE };
    switch (event.plan.kind) {
      case RoomEventKind.Torch:
        event.torch = this.createTorch(center, event.plan.waves, now);
        break;
      case RoomEventKind.Purse:
        event.purseAt = now + this.deps.config.purse.spawnDelayMs;
        break;
      case RoomEventKind.Dark:
        sound.play(SoundCue.CandleSnuff, center);
        break;
    }
  }

  /** Pokój wybity: nawała skończona i żaden wróg nie stoi w środku. */
  private isCleared(event: ActiveEvent): boolean {
    if (this.deps.hordePhase(event.room.id) !== HordePhase.Done) return false;
    return !this.deps.enemies().some((e) => !e.isDead && isInsideRoom(event.room, { x: Math.floor(e.x / TILE_SIZE), y: Math.floor(e.y / TILE_SIZE) }, 0));
  }

  private heroInside(room: Room): boolean {
    return this.deps.party.living.some((p) => isInsideRoom(room, { x: Math.floor(p.x / TILE_SIZE), y: Math.floor(p.y / TILE_SIZE) }, 0));
  }

  private darkTarget(event: ActiveEvent, cleared: boolean): number {
    if (cleared || !this.heroInside(event.room)) return 0;
    if (event.plan.kind === RoomEventKind.Dark) return this.deps.config.dark.dread;
    if (event.plan.kind === RoomEventKind.Torch && event.torch?.race.result === TorchOutcome.BurntOut) return this.deps.config.torch.burnoutDread;
    return 0;
  }

  private reward(at: Vector2, gold: number): void {
    this.deps.dropLoot(at, [{ kind: PickupKind.Gold, amount: gold }]);
    this.deps.effects.impact(at.x, at.y, 14);
  }

  // ——— Pochodnia ———

  private createTorch(at: Vector2, waves: number, now: number): TorchView {
    const { scene, config, tileset } = this.deps;
    const race = TorchRace.forWaves(config.torch, waves);
    race.start(now);
    // Żelazny słup z misą (bez kolizji — dekoracja, zasada kroku 16), płomień z animacji pochodni biomu.
    const stand = scene.add.graphics().setDepth(RENDER_DEPTH.shrine);
    stand.fillStyle(0x1b1a22, 0.4).fillEllipse(at.x, at.y + 2, 18, 6);
    stand.fillStyle(0x1b1a22, 1).fillRect(at.x - 2, at.y - 18, 4, 20).fillRect(at.x - 7, at.y - 21, 14, 4);
    stand.fillStyle(0x646c79, 1).fillRect(at.x - 1, at.y - 17, 2, 18).fillRect(at.x - 6, at.y - 20, 12, 2);
    const flame = scene.add.sprite(at.x, at.y - 20, tileset.sheetKey).setOrigin(0.5, 0.8).setDepth(RENDER_DEPTH.torchFlame);
    flame.play({ key: tileset.torchAnimation, startFrame: Math.floor(Math.random() * 4) });
    screenFx.glow(flame, GlowGroup.Torch);
    sound.play(SoundCue.Impact, at);
    return { race, at, stand, flame, light: { x: at.x, y: at.y - 22, radius: config.torch.lightRadius.full } };
  }

  private updateTorch(event: ActiveEvent, now: number, cleared: boolean): void {
    const torch = event.torch;
    if (!torch || event.done) return;
    const before = torch.race.result;
    const result = torch.race.update(now, cleared);
    const { config } = this.deps;
    if (result === TorchOutcome.Burning) {
      const left = torch.race.remaining(now);
      // Migotanie w końcówce (ostrzeżenie); skala płomienia maleje z ogniem. Promień światła co 8 px (stemple).
      const warn = left < config.torch.warnFraction && Math.floor(now / 120) % 2 === 0;
      torch.flame.setScale(0.6 + 0.8 * left).setAlpha(warn ? 0.6 : 1);
      torch.light.radius = Math.max(8, Math.round(torchLightRadius(config.torch, left) / 8) * 8);
      return;
    }
    if (before !== TorchOutcome.Burning) return;
    event.done = true;
    if (result === TorchOutcome.Won) {
      // Wygrana: płomień buchnął i pochodnia sypie złotem.
      torch.flame.setScale(1.6).setAlpha(1);
      torch.light.radius = config.torch.lightRadius.full;
      this.reward(torch.at, eventGold(config.torch.reward, this.deps.floorNumber));
      sound.play(SoundCue.UiConfirm, torch.at);
      this.deps.scene.time.delayedCall(900, () => torch.flame.setScale(1));
    } else {
      torch.flame.setVisible(false);
      torch.light.radius = 0;
      sound.play(SoundCue.CandleSnuff, torch.at);
      this.deps.effects.impact(torch.at.x, torch.at.y - 20, 8);
    }
  }

  // ——— Sakiewka ———

  private updatePurse(event: ActiveEvent, now: number, dt: number): void {
    const { config, scene, party, rng } = this.deps;
    if (event.done) return;
    if (!event.purse) {
      if (now < event.purseAt) return;
      const bounds = roomBounds(event.room, TILE_SIZE, TILE_SIZE * 0.6);
      const at = purseSpawnPoint(bounds, party.living);
      const sprite = scene.add.sprite(at.x, at.y, LOOT_ATLAS.key, LOOT_FRAMES.purse[0]).setDepth(RENDER_DEPTH.item);
      sprite.play(lootAnimationKey('purse'));
      screenFx.glow(sprite, GlowGroup.Torch);
      event.purse = { sprite, bounds, at, wander: purseWanderTarget(bounds, rng), bornAt: now };
      this.deps.effects.impact(at.x, at.y, 10);
      sound.play(SoundCue.RoachScatter, at);
      return;
    }
    const purse = event.purse;
    const heroes = party.living;
    const catcher = purseCaughtBy(purse.at, heroes, config.purse.catchRadius);
    if (catcher) {
      event.done = true;
      this.reward(purse.at, eventGold(config.purse.reward, this.deps.floorNumber));
      sound.play(SoundCue.UiConfirm, purse.at);
      purse.sprite.destroy();
      return;
    }
    if (now - purse.bornAt >= config.purse.lifetimeMs) {
      // Uciekła: zapada się w szczelinę posadzki.
      event.done = true;
      this.deps.effects.impact(purse.at.x, purse.at.y, 10);
      sound.play(SoundCue.RoachScatter, purse.at);
      scene.tweens.add({ targets: purse.sprite, scaleX: 0.2, scaleY: 0.2, alpha: 0, duration: 260, onComplete: () => purse.sprite.destroy() });
      return;
    }
    if (Math.hypot(purse.wander.x - purse.at.x, purse.wander.y - purse.at.y) < 12) purse.wander = purseWanderTarget(purse.bounds, rng);
    const heading = purseHeading(purse.at, heroes, purse.bounds, config.purse, purse.wander);
    purse.at = stepPurse(purse.at, heading, purse.bounds, dt);
    purse.sprite.setPosition(Math.round(purse.at.x), Math.round(purse.at.y));
    if (heading.x !== 0) purse.sprite.setFlipX(heading.x < 0);
    // Ostatnie 3 s: miga — zaraz ucieknie.
    const left = config.purse.lifetimeMs - (now - purse.bornAt);
    purse.sprite.setAlpha(left < 3000 && Math.floor(now / 150) % 2 === 0 ? 0.55 : 1);
  }

  // ——— Ciemny pokój ———

  private updateDark(event: ActiveEvent, cleared: boolean): void {
    if (event.done || !cleared) return;
    event.done = true;
    const center = { x: (event.room.x + event.room.width / 2) * TILE_SIZE, y: (event.room.y + event.room.height / 2) * TILE_SIZE };
    this.reward(center, eventGold(this.deps.config.dark.reward, this.deps.floorNumber));
  }

  destroy(): void {
    for (const event of this.events) {
      event.torch?.stand.destroy();
      event.torch?.flame.destroy();
      event.purse?.sprite.destroy();
    }
  }
}
