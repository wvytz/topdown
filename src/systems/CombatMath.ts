/** Czysta geometria i matematyka walki — testowalna bez Phasera. */
import type { Vector2 } from '@/core/types';

export function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function normalize(v: Vector2): Vector2 {
  const length = Math.hypot(v.x, v.y);
  return length === 0 ? { x: 0, y: 0 } : { x: v.x / length, y: v.y / length };
}

export function directionTo(from: Vector2, to: Vector2): Vector2 {
  return normalize({ x: to.x - from.x, y: to.y - from.y });
}

export function angleTo(from: Vector2, to: Vector2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Sprowadza kąt do zakresu (-π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a <= -Math.PI) a += Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/**
 * Czy okrągły cel (środek + promień) znajduje się w łuku ataku wręcz.
 * Uwzględnia promień celu, więc duże cele na krawędzi łuku też są trafiane.
 */
export function isInMeleeArc(
  origin: Vector2,
  facingAngle: number,
  arcRadians: number,
  range: number,
  target: Vector2,
  targetRadius: number,
): boolean {
  const dist = distance(origin, target);
  if (dist > range + targetRadius) return false;
  if (dist <= targetRadius) return true;
  const angularPadding = Math.asin(Math.min(1, targetRadius / dist));
  const deviation = Math.abs(wrapAngle(angleTo(origin, target) - facingAngle));
  return deviation <= arcRadians / 2 + angularPadding;
}

/** Wektor odrzutu od źródła w stronę celu o zadanej sile (px/s). */
export function knockbackFrom(source: Vector2, target: Vector2, force: number): Vector2 {
  const dir = directionTo(source, target);
  return { x: dir.x * force, y: dir.y * force };
}

/** Liniowe skalowanie statystyki z piętrem: base * (1 + perFloor * (floor - 1)). */
export function scaleForFloor(base: number, floor: number, perFloor: number): number {
  return Math.round(base * (1 + perFloor * Math.max(0, floor - 1)));
}
