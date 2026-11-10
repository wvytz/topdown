import type { LurchDefinition } from '@/core/bossTypes';
import type { MovementIntent } from '@/core/types';

/** Stan szarpanego chodu w chwili `now`: mnożnik prędkości i odchylenie kierunku (radiany). */
export interface LurchState {
  readonly speedMultiplier: number;
  readonly swayRad: number;
}

/**
 * Szarpany chód (Pożeracz, krok 184): w każdym cyklu najpierw zryw, potem zamarcie. Kierunek chwieje się na zmianę
 * w lewo i w prawo (co drugi cykl), z pełnym odchyleniem w środku zrywu — kula „toczy się” krzywo i nierówno.
 */
export function lurchAt(lurch: LurchDefinition, now: number): LurchState {
  const cycle = Math.floor(now / lurch.periodMs);
  const t = (now - cycle * lurch.periodMs) / lurch.periodMs;
  if (t >= lurch.burstShare) return { speedMultiplier: lurch.restMultiplier, swayRad: 0 };
  const side = cycle % 2 === 0 ? 1 : -1;
  const sway = Math.sin((Math.PI * t) / lurch.burstShare) * ((lurch.swayDeg * Math.PI) / 180) * side;
  return { speedMultiplier: lurch.burstMultiplier, swayRad: sway };
}

/** Średni mnożnik prędkości w cyklu — do strojenia (zryw i zamarcie razem ≈ zwykły chód). */
export function lurchAverage(lurch: LurchDefinition): number {
  return lurch.burstShare * lurch.burstMultiplier + (1 - lurch.burstShare) * lurch.restMultiplier;
}

/** Kierunek obrócony o `rad` (długość bez zmian). */
export function swayDirection(move: MovementIntent, rad: number): MovementIntent {
  if (rad === 0) return move;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: move.x * c - move.y * s, y: move.x * s + move.y * c };
}
