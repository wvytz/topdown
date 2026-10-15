import Phaser from 'phaser';
import type { DamageResult, Hit } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { COCOON_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { attachGroundShadow } from '@/effects/GroundShadow';
import type { MeleeTarget } from '@/systems/MeleeResolver';

/**
 * Kokon skarbu w ukrytej komnacie (krok 46): wygląda jak kokon leża, ale się nie budzi i nic z niego nie wyskakuje.
 * Pęka od jednego trafienia; menedżer decyduje, czy w środku był przedmiot.
 */
export class TreasureCocoon extends Phaser.GameObjects.Sprite implements MeleeTarget {
  private cracked = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly radius: number,
    readonly hasPrize: boolean,
  ) {
    super(scene, x, y, SPRITE_SHEETS[COCOON_VISUAL.sheet].key);
    scene.add.existing(this);
    this.setDepth(RENDER_DEPTH.enemy);
    attachGroundShadow(this, COCOON_VISUAL.groundShadow);
    this.play({ key: animationKey(COCOON_VISUAL.sheet, COCOON_VISUAL.idle), startFrame: Math.floor(Math.random() * 2) });
  }

  get isCracked(): boolean {
    return this.cracked;
  }

  takeHit(_hit: Hit, _now: number, _source: Vector2): DamageResult {
    this.cracked = true;
    return { dealt: 0, died: false };
  }
}
