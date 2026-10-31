import Phaser from 'phaser';
import type { Vector2 } from '@/core/types';
import { RENDER_DEPTH } from '@/config/renderLayers';

/** Wygląd odbicia bohaterów (krok 152): jasne kółko jak na wodzie, rozchodzi się i gaśnie. Czysto wizualne. */
const RIPPLE = { color: 0xbfefff, fromRadius: 6, toRadius: 20, alpha: 0.7, width: 2, durationMs: 260 } as const;

export function drawBubbleRipple(scene: Phaser.Scene, at: Vector2): void {
  const gfx = scene.add.graphics().setDepth(RENDER_DEPTH.slash);
  const state = { r: RIPPLE.fromRadius, a: RIPPLE.alpha };
  const draw = (): void => {
    gfx.clear();
    gfx.lineStyle(RIPPLE.width, RIPPLE.color, state.a).strokeCircle(Math.round(at.x), Math.round(at.y), state.r);
  };
  draw();
  scene.tweens.add({
    targets: state,
    r: RIPPLE.toRadius,
    a: 0,
    duration: RIPPLE.durationMs,
    ease: 'Quad.easeOut',
    onUpdate: draw,
    onComplete: () => gfx.destroy(),
  });
}
