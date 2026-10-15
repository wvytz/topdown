import type { Vector2 } from '@/core/types';

export type { ShieldDefinition } from '@/core/bossTypes';

/**
 * Tarcza bossa (krok 41e — Strażnik Bram, potem Kat Otchłani): chroni stożek przed bossem.
 * Pociski z przodu odbija, promień z przodu nie rani, cios w tarczę zadaje część obrażeń.
 * Boss obraca tarczę do gracza z ograniczoną prędkością, a w trakcie ataku wcale — da się go obejść.
 */

/** Czy punkt `from` jest przed tarczą (w stożku `arcDeg` wokół kąta `facing`, radiany). */
export function isShielded(center: Vector2, facing: number, arcDeg: number, from: Vector2): boolean {
  const angle = Math.atan2(from.y - center.y, from.x - center.x);
  return Math.abs(angleDelta(facing, angle)) <= (arcDeg * Math.PI) / 360;
}

/** Różnica kątów w (−π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Obrót z `current` w stronę `target` najwyżej o `maxStep` radianów. */
export function turnToward(current: number, target: number, maxStep: number): number {
  const d = angleDelta(current, target);
  return Math.abs(d) <= maxStep ? target : current + Math.sign(d) * maxStep;
}

/** Kierunek odbitego pocisku: z powrotem w stronę, z której przyleciał. */
export function reflectDirection(velocity: Vector2): Vector2 {
  return { x: -velocity.x, y: -velocity.y };
}

/**
 * Pierścień ognia (Kat Otchłani, krok 41f): promień wolnego koła w środku areny `elapsedMs` od zapłonu —
 * kurczy się liniowo od `startRadius` do `minRadius` przez `shrinkMs`.
 */
export function fireRingRadius(startRadius: number, minRadius: number, shrinkMs: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return startRadius;
  const t = shrinkMs > 0 ? Math.min(1, elapsedMs / shrinkMs) : 1;
  return startRadius + (minRadius - startRadius) * t;
}
