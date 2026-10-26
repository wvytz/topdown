import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type { DungeonFloor } from '@/core/dungeonTypes';
import { PickupKind } from '@/core/lootTypes';
import type { LootDrop } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { ITEM_POOL, SECRET_ROOM_CONFIG } from '@/config/lootConfig';
import { COCOON_VISUAL, SECRET_ROOM_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { DungeonView } from '@/dungeon/DungeonView';
import type { SecretArea } from '@/dungeon/SecretRoom';
import { areaBounds, planTreasureCocoons, revealMask } from '@/dungeon/SecretRoom';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { Party } from '@/entities/Party';
import { TreasureCocoon } from '@/entities/TreasureCocoon';
import { pickWeightedItem } from '@/systems/Loot';
import type { DashSweep } from '@/systems/DashStrike';
import { resolveDashSweep } from '@/systems/DashStrike';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import type { BeamStrike } from '@/systems/Sorcery';
import { resolveBeam } from '@/systems/Sorcery';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot } from '@/systems/ShotResolver';

export interface SecretRoomDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly area: SecretArea;
  readonly view: DungeonView;
  /** Bohaterowie (co-op, etap C0). */
  readonly party: Party;
  readonly effects: CombatEffects;
  /** RNG komnaty: rozmieszczenie kokonów i przedmiot. */
  readonly rng: Rng;
  readonly dropLoot: (at: { x: number; y: number }, drops: readonly LootDrop[]) => void;
  readonly onRevealed: () => void;
}

/**
 * Ukryta komnata za areną (krok 46): pokazuje się, gdy gracz podejdzie na 2 kafle; wtedy pojawiają się kokony skarbu.
 * Każde trafienie rozbija kokon; z jednego wypada losowy przedmiot z puli. Decyzje — czysty `dungeon/SecretRoom`.
 */
export class SecretRoomManager {
  private readonly mask: Uint8Array;
  private revealed = false;
  private cocoons: TreasureCocoon[] = [];

  constructor(private readonly deps: SecretRoomDeps) {
    this.mask = revealMask(deps.floor, deps.area, SECRET_ROOM_CONFIG.revealRadius);
  }

  update(): void {
    const { party, floor } = this.deps;
    if (!this.revealed) {
      // Komnatę odsłania którykolwiek żywy bohater.
      const inside = party.living.some((player) => {
        const tile = DungeonView.worldToTile(player.x, player.y);
        return this.mask[tile.y * floor.width + tile.x] === 1;
      });
      if (inside) this.reveal();
    }
    this.cocoons = this.cocoons.filter((cocoon) => {
      if (!cocoon.isCracked) return true;
      this.crack(cocoon);
      return false;
    });
  }

  private reveal(): void {
    const { scene, floor, area, view, rng } = this.deps;
    this.revealed = true;
    view.revealSecret(areaBounds(floor, area, SECRET_ROOM_VISUAL.redrawMargin));
    const plan = planTreasureCocoons(area.room, SECRET_ROOM_CONFIG, rng);
    plan.tiles.forEach((tile, i) => {
      const at = DungeonView.tileToWorldCenter(tile);
      this.cocoons.push(new TreasureCocoon(scene, at.x, at.y, SECRET_ROOM_VISUAL.cocoonRadius, i === plan.prize));
    });
    const center = DungeonView.tileToWorldCenter({ x: area.room.x + Math.floor(area.room.width / 2), y: area.room.y + Math.floor(area.room.height / 2) });
    this.deps.effects.impact(center.x, center.y, SECRET_ROOM_VISUAL.revealFlashRadius);
    scene.cameras.main.shake(SECRET_ROOM_VISUAL.shakeMs, SECRET_ROOM_VISUAL.shakeIntensity);
    sound.play(SoundCue.Secret);
    this.deps.onRevealed();
  }

  private crack(cocoon: TreasureCocoon): void {
    const at = { x: cocoon.x, y: cocoon.y };
    cocoon.destroy();
    const { sheet, burst } = COCOON_VISUAL;
    const tear = this.deps.scene.add.sprite(at.x, at.y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.deathBurst);
    tear.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => tear.setDepth(RENDER_DEPTH.combatDecal));
    tear.play(animationKey(sheet, burst));
    sound.play(SoundCue.Break, at);
    if (!cocoon.hasPrize) {
      this.deps.effects.floatingText(at.x, at.y, 'pusto', SECRET_ROOM_VISUAL.emptyText);
      return;
    }
    const itemId = pickWeightedItem(ITEM_POOL, this.deps.rng);
    if (itemId !== null) this.deps.dropLoot(at, [{ kind: PickupKind.Item, itemId }]);
    this.deps.effects.impact(at.x, at.y, SECRET_ROOM_VISUAL.prizeFlashRadius);
  }

  resolvePlayerMelee(swing: MeleeSwing): void {
    resolveMeleeSwing(swing, this.cocoons);
  }

  resolvePlayerBeam(beam: BeamStrike): void {
    resolveBeam(beam, this.cocoons);
  }

  resolvePlayerShot(shot: PlayerShot): TreasureCocoon | null {
    return resolvePlayerShot(shot, this.cocoons)?.target ?? null;
  }

  resolveDashSweep(sweep: DashSweep, alreadyHit: Set<object>): void {
    resolveDashSweep(sweep, this.cocoons, alreadyHit);
  }
}
