import Phaser from 'phaser';
import type { DamageResult, Hit } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { LARDER_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { attachGroundShadow } from '@/effects/GroundShadow';
import type { MeleeTarget } from '@/systems/MeleeResolver';

/**
 * Kokon spiżarni Wampirzego Lorda (krok 33): bez ciała fizycznego (jak kokony leża). Trafienie gracza rozrywa
 * go (wychodzi zarażony); Lord go pożera; zew rozrywa go od środka. Zasady w BossFight / BossBrain.
 */
export class LarderCocoon extends Phaser.GameObjects.Sprite implements MeleeTarget {
  readonly radius: number;
  /** Trafiony przez gracza — BossFight odbiera to w tej samej klatce. */
  tornByHit = false;

  constructor(scene: Phaser.Scene, x: number, y: number, radius: number) {
    super(scene, x, y, SPRITE_SHEETS[LARDER_VISUAL.sheet].key);
    this.radius = radius;
    scene.add.existing(this);
    this.setDepth(RENDER_DEPTH.enemy);
    attachGroundShadow(this, LARDER_VISUAL.groundShadow);
    this.play({ key: animationKey(LARDER_VISUAL.sheet, LARDER_VISUAL.idle), startFrame: Math.floor(Math.random() * 2) });
  }

  get position(): Vector2 {
    return { x: this.x, y: this.y };
  }

  /** Zew: kokon drży do chwili rozdarcia. */
  shake(): void {
    this.play(animationKey(LARDER_VISUAL.sheet, LARDER_VISUAL.shake));
  }

  takeHit(_hit: Hit, _now: number, _source: Vector2): DamageResult {
    this.tornByHit = true;
    return { dealt: 0, died: false };
  }
}
