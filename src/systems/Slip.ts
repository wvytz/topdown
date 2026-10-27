import type { Vector2 } from '@/core/types';

/**
 * Poślizg (krok 125, kałuże sprzątaczek): prędkość dąży do zamierzonej wykładniczo z siłą `traction` (1/s), więc
 * bohater sunie dalej po puszczeniu klawiszy, a skręt zajmuje chwilę. Pęd z odrzutu i dasha też wygasa powoli.
 */
export function slideVelocity(current: Vector2, desired: Vector2, dtMs: number, traction: number): Vector2 {
  const k = 1 - Math.exp((-traction * Math.max(0, dtMs)) / 1000);
  return { x: current.x + (desired.x - current.x) * k, y: current.y + (desired.y - current.y) * k };
}
