import Phaser from 'phaser';
import type { Vector2 } from '@/core/types';
import type { BossId } from '@/core/bossTypes';
import { BOSS_LASH_FX } from '@/config/bossPresentationConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { facingDirection } from '@/systems/Facing';

/** Czy ten boss ma błysk pazurów smagnięcia (krok U6). */
export function hasLashFx(boss: BossId): boolean {
  return BOSS_LASH_FX[boss] !== undefined;
}

/**
 * Błysk pazurów smagnięcia (krok U6): klatki z generatora w kierunku ciosu (od bossa do środka strefy),
 * nad mrokiem jak reszta feelu walki (STYLEGUIDE §13.5). Znika po ostatniej klatce.
 */
export function playLashFx(scene: Phaser.Scene, boss: BossId, from: Vector2, center: Vector2): void {
  const fx = BOSS_LASH_FX[boss];
  if (!fx) return;
  const dx = center.x - from.x;
  const dy = center.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const direction = facingDirection({ x: dx, y: dy }) ?? 4;
  const x = from.x + (dx / len) * fx.aheadPx;
  const y = from.y + (dy / len) * fx.aheadPx;
  const sprite = scene.add.sprite(Math.round(x), Math.round(y), SPRITE_SHEETS[fx.sheet].key).setDepth(RENDER_DEPTH.combatFx);
  sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
  sprite.play(animationKey(fx.sheet, fx.animation, direction));
}
