import Phaser from 'phaser';
import type { DamageResult, Hit } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { PUFFBALL_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { attachGroundShadow } from '@/effects/GroundShadow';
import { CocoonPhase, CocoonState } from '@/systems/Cocoons';
import type { MeleeTarget } from '@/systems/MeleeResolver';
import type { PuffballConfig } from '@/systems/Puffballs';

/**
 * Purchawka Grzybni (krok 28c): bez ciała fizycznego (jak kokon — nie zmienia linii wzroku Kiterów).
 * Zapalnik wspólny z kokonem (CocoonState); tutaj spoczynek, nabrzmiewanie i pęknięcie.
 */
export class Puffball extends Phaser.GameObjects.Sprite implements MeleeTarget {
  readonly radius: number;
  private readonly fuse: CocoonState;
  /** Ustawiane przez trafienie; menedżer odbiera je w tej samej klatce. */
  private burstByHit = false;

  constructor(scene: Phaser.Scene, x: number, y: number, config: PuffballConfig) {
    super(scene, x, y, SPRITE_SHEETS[PUFFBALL_VISUAL.sheet].key);
    this.radius = config.radius;
    this.fuse = new CocoonState(config);
    scene.add.existing(this);
    this.setDepth(RENDER_DEPTH.enemy);
    attachGroundShadow(this, PUFFBALL_VISUAL.groundShadow);
    this.play({ key: animationKey(PUFFBALL_VISUAL.sheet, PUFFBALL_VISUAL.idle), startFrame: Math.floor(Math.random() * 2) });
  }

  /** Chwila pęknięcia po zbudzeniu (Infinity, gdy śpi). */
  get burstAt(): number {
    return this.fuse.burstAt;
  }

  /** Klatka gry; true = purchawka właśnie pękła (zbliżenie albo trafienie). */
  tick(player: Vector2 | null, now: number): boolean {
    if (this.burstByHit) {
      this.burstByHit = false;
      return true;
    }
    const wasArmed = Number.isFinite(this.fuse.burstAt);
    const burst = this.fuse.update({ x: this.x, y: this.y }, player, now);
    if (!wasArmed && this.fuse.currentPhase === CocoonPhase.Fusing) {
      this.play(animationKey(PUFFBALL_VISUAL.sheet, PUFFBALL_VISUAL.fuse));
    }
    return burst;
  }

  takeHit(_hit: Hit, now: number, _source: Vector2): DamageResult {
    if (this.fuse.hit(now)) this.burstByHit = true;
    return { dealt: 0, died: false };
  }
}
