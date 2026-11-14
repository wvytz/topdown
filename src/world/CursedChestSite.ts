import Phaser from 'phaser';
import { SoundCue, sound } from '@/audio/SoundBoard';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { LOOT_ATLAS, LOOT_FRAMES, lootAnimationKey } from '@/config/spriteConfig';
import type { EliteAffix, EnemyType } from '@/core/combatTypes';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { ItemDefinition, LootDrop } from '@/core/lootTypes';
import { PickupKind } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';
import { diag } from '@/diagnostics/DiagnosticsHub';
import { DungeonView } from '@/dungeon/DungeonView';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { Enemy } from '@/entities/Enemy';
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';
import { distance } from '@/systems/CombatMath';
import type { CursedChestConfig, CursedChestPlan } from '@/systems/CursedChest';
import { CursedChestPhase, CursedChestState, curseRoster, curseSpawnTiles, pickAffixes } from '@/systems/CursedChest';
import { eventGold } from '@/systems/RoomEvents';
import { UiText, uiText } from '@/ui/UiText';

export interface CursedChestSiteDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  readonly plan: CursedChestPlan;
  readonly config: CursedChestConfig;
  readonly party: Party;
  readonly rng: Rng;
  /** Elita klątwy: wróg archetypu biomu z cechami, wychodzący biernie przez `riseMs`. */
  readonly spawnElite: (type: EnemyType, at: Vector2, affixes: readonly EliteAffix[], riseMs: number) => Enemy;
  /** Pula cech elity dla archetypu na tym piętrze i ich liczba (pętla wieży). */
  readonly affixPool: (type: EnemyType) => readonly EliteAffix[];
  readonly affixCount: number;
  /** Przedmioty, które otwierającemu jeszcze coś dadzą (krok 117). */
  readonly poolFor: (hero: Player) => readonly ItemDefinition[];
  readonly dropLoot: (at: Vector2, drops: readonly LootDrop[]) => void;
  readonly effects: CombatEffects;
}

/** Fiolet klątwy — ten sam co pierścień skrzyni w `tools/loot_sprites.py`. */
const CURSE_COLOR = 0x9a5ad8;
const CURSE_TEXT = '#c890ff';

interface PendingElite {
  readonly at: number;
  readonly position: Vector2;
  readonly type: EnemyType;
  readonly affixes: readonly EliteAffix[];
  readonly gfx: Phaser.GameObjects.Graphics;
}

/**
 * Przeklęta skrzynia (krok U8b): fioletowo pulsuje w pokoju; bohater obok widzi „[E] Otwórz” — to wybór, nie
 * pułapka. Otwarcie budzi klątwę: elity wychodzą ze znaczników w pierścieniu wokół skrzyni. Po ich wybiciu skrzynia
 * wyrzuca przedmiot (z puli otwierającego) i złoto. Elity mają zwykły łup elit.
 */
export class CursedChestSite {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly prompt: UiText;
  private readonly state = new CursedChestState();
  private readonly position: Vector2;
  private pending: PendingElite[] = [];
  private elites: Enemy[] = [];
  private opener: Player | null = null;
  private openable = false;

  constructor(private readonly deps: CursedChestSiteDeps) {
    this.position = DungeonView.tileToWorldCenter(deps.plan.tile);
    const { scene } = deps;
    this.sprite = scene.add.sprite(this.position.x, this.position.y - 4, LOOT_ATLAS.key, LOOT_FRAMES.cursedChest[0]).setDepth(RENDER_DEPTH.shrine);
    this.sprite.play(lootAnimationKey('cursedChest'));
    this.prompt = uiText(scene, this.position.x, this.position.y - 26, '[E] Otwórz', { color: CURSE_TEXT, align: 'center' })
      .setOrigin(0.5, 1)
      .setDepth(RENDER_DEPTH.worldText)
      .setVisible(false);
  }

  /** Kafel skrzyni na minimapę; null — już otwarta. */
  get markerTile(): { readonly x: number; readonly y: number } | null {
    return this.state.current === CursedChestPhase.Closed ? this.deps.plan.tile : null;
  }

  /** Bohater stoi przy zamkniętej skrzyni — E zadziała (HUD: przycisk E na dotyku). */
  get canOpen(): boolean {
    return this.openable;
  }

  /** `interactPressed(bohater)` — czy ten bohater wcisnął E w tej klatce. */
  update(now: number, interactPressed: (hero: Player) => boolean): void {
    this.openable = false;
    if (this.state.current === CursedChestPhase.Closed) {
      const hero = this.deps.party.nearestLiving(this.position);
      const near = hero !== null && hero !== undefined && distance(hero, this.position) <= this.deps.config.interactRadius;
      this.prompt.setVisible(near);
      this.openable = near;
      if (near && interactPressed(hero)) this.open(hero, now);
      return;
    }
    this.pending = this.pending.filter((p) => this.hatch(p, now));
    this.elites = this.elites.filter((e) => e.active && !e.isDead);
    if (this.state.update(this.pending.length, this.elites.length)) this.lift();
  }

  private open(hero: Player, now: number): void {
    if (!this.state.open()) return;
    const { config, floor, plan, floorNumber, rng, scene } = this.deps;
    this.opener = hero;
    this.prompt.setVisible(false);
    this.sprite.stop().setFrame(LOOT_FRAMES.cursedChestOpen[0]!);
    this.deps.effects.impact(this.position.x, this.position.y, 22);
    sound.play(SoundCue.LurkBurst, this.position);
    const roster = curseRoster(config, floorNumber, rng);
    const room = floor.rooms[plan.roomId]!;
    const tiles = curseSpawnTiles(floor, room, plan.tile, config.ringTiles, roster.length);
    roster.slice(0, tiles.length).forEach((type, i) => {
      const affixes = pickAffixes(this.deps.affixPool(type), this.deps.affixCount + config.extraAffixes, rng);
      const position = DungeonView.tileToWorldCenter(tiles[i]!);
      this.pending.push({ at: now + config.telegraphMs, position, type, affixes, gfx: scene.add.graphics().setDepth(RENDER_DEPTH.telegraph) });
    });
    diag.note('cursed-chest', { floor: floorNumber, elites: this.pending.length });
  }

  /** Znacznik pulsuje fioletem; po telegrafie wychodzi elita. Zwraca false, gdy wyszła. */
  private hatch(p: PendingElite, now: number): boolean {
    if (now >= p.at) {
      p.gfx.destroy();
      this.elites.push(this.deps.spawnElite(p.type, p.position, p.affixes, this.deps.config.riseMs));
      this.deps.effects.impact(p.position.x, p.position.y, 12);
      sound.play(SoundCue.Brood, p.position);
      return false;
    }
    const pulse = 0.75 + 0.25 * Math.sin((now / 120) * Math.PI);
    const r = TILE_SIZE * 0.4 * pulse;
    p.gfx.clear().fillStyle(CURSE_COLOR, 0.25).fillCircle(p.position.x, p.position.y, r).lineStyle(1, CURSE_COLOR, 0.9).strokeCircle(p.position.x, p.position.y, r);
    return true;
  }

  /** Klątwa zdjęta: przedmiot z puli otwierającego i złoto. */
  private lift(): void {
    const { rng, floorNumber, config } = this.deps;
    const pool = this.opener ? this.deps.poolFor(this.opener) : [];
    const drops: LootDrop[] = [{ kind: PickupKind.Gold, amount: eventGold(config.reward, floorNumber) }];
    if (pool.length > 0) drops.push({ kind: PickupKind.Item, itemId: pool[rng.int(0, pool.length - 1)]!.id });
    this.deps.dropLoot({ x: this.position.x, y: this.position.y + 10 }, drops);
    this.deps.effects.impact(this.position.x, this.position.y, 18);
    sound.play(SoundCue.Shrine, this.position);
    this.sprite.setAlpha(0.7);
  }
}
