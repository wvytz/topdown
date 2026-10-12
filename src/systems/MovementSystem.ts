import type { MovementIntent, MovementStats, Vector2 } from '@/core/types';

/**
 * Czysta logika ruchu — niezależna od Phasera, łatwa do testów jednostkowych.
 * Normalizuje wektor, żeby ruch po przekątnej nie był szybszy.
 */
export function computeVelocity(intent: MovementIntent, stats: MovementStats): Vector2 {
  const length = Math.hypot(intent.x, intent.y);
  if (length === 0) return { x: 0, y: 0 };

  const scale = stats.moveSpeed / Math.max(length, 1);
  return { x: intent.x * scale, y: intent.y * scale };
}
