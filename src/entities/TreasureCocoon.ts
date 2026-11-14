import Phaser from 'phaser';
import type { DamageResult, Hit } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { SPRITE_SHEETS, TREASURE_COCOON_VISUAL, animationKey } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { attachGroundShadow } from '@/effects/GroundShadow';
import type { MeleeTarget } from '@/systems/MeleeResolver';

/**
 * Kokon skarbu w ukrytej komnacie (krok 46): nie budzi się i nic z niego nie wyskakuje. Od kroku U4b (prośba
 * właściciela) ma własny wygląd — złoty szew i błysk delikatnie zdradzają, że w środku może być coś cennego.
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
    super(scene, x, y, SPRITE_SHEETS[TREASURE_COCOON_VISUAL.sheet].key);
    scene.add.existing(this);
    this.setDepth(RENDER_DEPTH.enemy);
    attachGroundShadow(this, TREASURE_COCOON_VISUAL.groundShadow);
    const idle = animationKey(TREASURE_COCOON_VISUAL.sheet, TREASURE_COCOON_VISUAL.idle);
    this.play({ key: idle, startFrame: Math.floor(Math.random() * 4) });
  }

  get isCracked(): boolean {
    return this.cracked;
  }

  takeHit(_hit: Hit, _now: number, _source: Vector2): DamageResult {
    this.cracked = true;
    return { dealt: 0, died: false };
  }
}
