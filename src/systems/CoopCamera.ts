import type { Vector2 } from '@/core/types';

/**
 * Wspólny ekran co-opu (etap C2, decyzja właściciela): kamera patrzy na środek między żywymi bohaterami,
 * a smycz nie pozwala im się rozejść poza kadr. Czysta logika — scena tylko przesuwa ciała i kamerę.
 */

/** Środek między bohaterami (punkt, za którym idzie kamera); jeden bohater — on sam. */
export function partyFocus(positions: readonly Vector2[]): Vector2 | null {
  if (positions.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const p of positions) {
    x += p.x;
    y += p.y;
  }
  return { x: x / positions.length, y: y / positions.length };
}

/**
 * Smycz na jednej osi dla dwóch bohaterów. `before` — pozycje z poprzedniej klatki (w zasięgu smyczy),
 * `after` — po ruchu. Gdy odstęp przekracza `max`, nadmiar cofa ten, kto się oddalał; gdy oddalali się obaj
 * (każdy w swoją stronę), nadmiar dzielą proporcjonalnie do własnego ruchu. Bohater nie ciągnie partnera.
 */
export function leashAxis(before: readonly [number, number], after: readonly [number, number], max: number): [number, number] {
  const [a, b] = after;
  const gap = Math.abs(a - b);
  if (gap <= max) return [a, b];
  const excess = gap - max;
  // Kierunek „na zewnątrz” dla każdego: a oddala się, gdy rośnie po swojej stronie b.
  const sideA = Math.sign(a - b);
  const outA = Math.max(0, (a - before[0]) * sideA);
  const outB = Math.max(0, (b - before[1]) * -sideA);
  const total = outA + outB;
  // Nikt się nie oddalał (np. odrzut ciosem) — dzielimy po równo, żeby odstęp wrócił do smyczy.
  const shareA = total > 0 ? outA / total : 0.5;
  return [a - sideA * excess * shareA, b + sideA * excess * (1 - shareA)];
}

/** Smycz dla dwóch bohaterów na obu osiach; `max` — największy odstęp w poziomie i w pionie. */
export function leashPair(
  before: readonly [Vector2, Vector2],
  after: readonly [Vector2, Vector2],
  max: Vector2,
): [Vector2, Vector2] {
  const [ax, bx] = leashAxis([before[0].x, before[1].x], [after[0].x, after[1].x], max.x);
  const [ay, by] = leashAxis([before[0].y, before[1].y], [after[0].y, after[1].y], max.y);
  return [
    { x: ax, y: ay },
    { x: bx, y: by },
  ];
}

/** Największy odstęp bohaterów: widok kamery (px świata) minus zapas na sylwetki. */
export function leashSpan(view: Vector2, margin: Vector2): Vector2 {
  return { x: Math.max(0, view.x - margin.x * 2), y: Math.max(0, view.y - margin.y * 2) };
}
