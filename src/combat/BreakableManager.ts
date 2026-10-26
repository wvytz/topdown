import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type { Hit, DamageResult } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { SPRITE_SHEETS, TRAP_VISUAL, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { DungeonView } from '@/dungeon/DungeonView';
import type { BreakableSpot } from '@/dungeon/TrapPlanner';
import { BreakableKind } from '@/dungeon/TrapPlanner';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { DashSweep } from '@/systems/DashStrike';
import { resolveDashSweep } from '@/systems/DashStrike';
import type { MeleeSwing, MeleeTarget } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import type { BeamStrike } from '@/systems/Sorcery';
import { resolveBeam } from '@/systems/Sorcery';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot } from '@/systems/ShotResolver';

/** Urna albo skrzynia (krok 48): bez ciała fizycznego, pęka od jednego trafienia. */
class Breakable extends Phaser.GameObjects.Sprite implements MeleeTarget {
  broken = false;

  constructor(
    scene: Phaser.Scene,
    at: Vector2,
    readonly spot: BreakableSpot,
    readonly radius: number,
  ) {
    super(scene, at.x, at.y, SPRITE_SHEETS[TRAP_VISUAL.breakables].key);
    scene.add.existing(this);
    this.setDepth(RENDER_DEPTH.shrine);
    this.play(animationKey(TRAP_VISUAL.breakables, animationName(spot, false)));
  }

  takeHit(_hit: Hit, _now: number, _source: Vector2): DamageResult {
    this.broken = true;
    return { dealt: 0, died: false };
  }
}

function animationName(spot: BreakableSpot, broken: boolean): string {
  const base = spot.kind === BreakableKind.Crate ? 'crate' : `urn${spot.variant}`;
  return broken ? `${base}Broken` : base;
}

export interface BreakableDeps {
  readonly scene: Phaser.Scene;
  readonly spots: readonly BreakableSpot[];
  readonly radius: number;
  readonly effects: CombatEffects;
  /** Łup z rozbitej urny lub skrzyni (tabela w lootConfig). */
  readonly onBroken: (at: Vector2) => void;
}

/**
 * Urny i skrzynie ruin (krok 48): każde trafienie gracza (cios, kula, strzał, promień, dash) rozbija je;
 * szczątki zostają na podłodze, czasem wypada trochę złota albo mała mikstura. Bez kolizji (dekoracja).
 */
export class BreakableManager {
  private items: Breakable[];

  constructor(private readonly deps: BreakableDeps) {
    this.items = deps.spots.map((spot) => new Breakable(deps.scene, DungeonView.tileToWorldCenter(spot.tile), spot, deps.radius));
  }

  update(): void {
    this.items = this.items.filter((item) => {
      if (!item.broken) return true;
      this.shatter(item);
      return false;
    });
  }

  private shatter(item: Breakable): void {
    const at = { x: item.x, y: item.y };
    item.destroy();
    this.deps.scene.add
      .sprite(at.x, at.y, SPRITE_SHEETS[TRAP_VISUAL.breakables].key)
      .setDepth(RENDER_DEPTH.combatDecal)
      .play(animationKey(TRAP_VISUAL.breakables, animationName(item.spot, true)));
    this.deps.effects.impact(at.x, at.y, item.radius * 1.6);
    sound.play(SoundCue.Break, at);
    this.deps.onBroken(at);
  }

  resolvePlayerMelee(swing: MeleeSwing): void {
    resolveMeleeSwing(swing, this.items);
  }

  resolvePlayerBeam(beam: BeamStrike): void {
    resolveBeam(beam, this.items);
  }

  resolvePlayerShot(shot: PlayerShot): MeleeTarget | null {
    return resolvePlayerShot(shot, this.items)?.target ?? null;
  }

  resolveDashSweep(sweep: DashSweep, alreadyHit: Set<object>): void {
    resolveDashSweep(sweep, this.items, alreadyHit);
  }
}
