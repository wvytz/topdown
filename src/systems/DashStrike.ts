import type { Hit } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { distance } from '@/systems/CombatMath';
import type { MeleeTarget, SwingResult } from '@/systems/MeleeResolver';

export interface DashSweep {
  readonly center: Vector2;
  readonly radius: number;
  readonly damage: number;
  readonly now: number;
  /** Krok U8c, Rozdeptanie: kierunek dasha (wektor jednostkowy) i siła odrzutu na boki; brak — bez odrzutu. */
  readonly heading?: Vector2;
  readonly sideKnockback?: number;
}

/**
 * Odrzut na bok od toru dasha (Rozdeptanie): prostopadle do `heading`, w stronę, po której stoi cel
 * (cel dokładnie na torze — w prawo od kierunku). Bohater przebija się przez tłum, który rozstępuje się na boki.
 */
export function sideKnockback(center: Vector2, heading: Vector2, target: Vector2, force: number): Vector2 {
  const perp = { x: -heading.y, y: heading.x };
  const side = (target.x - center.x) * perp.x + (target.y - center.y) * perp.y;
  const sign = side < 0 ? -1 : 1;
  return { x: perp.x * sign * force, y: perp.y * sign * force };
}

/**
 * Burzowy pęd: gracz w trakcie dasha rani cele, których dotknie — każdy co najwyżej raz na dash.
 * `alreadyHit` należy do bieżącego dasha i jest uzupełniany o nowe trafienia. Bez odrzutu, chyba że
 * Rozdeptanie (krok U8c) poda `heading` i `sideKnockback`.
 */
export function resolveDashSweep<T extends MeleeTarget>(
  sweep: DashSweep,
  targets: readonly T[],
  alreadyHit: Set<object>,
): SwingResult<T> {
  const hit: T[] = [];
  const killed: T[] = [];
  if (sweep.damage <= 0) return { hit, killed };

  const push = sweep.heading && sweep.sideKnockback ? { heading: sweep.heading, force: sweep.sideKnockback } : null;
  for (const target of targets) {
    if (alreadyHit.has(target) || distance(sweep.center, target) > sweep.radius + target.radius) continue;
    alreadyHit.add(target);
    hit.push(target);
    const blow: Hit = { damage: sweep.damage, knockback: push ? sideKnockback(sweep.center, push.heading, target, push.force) : { x: 0, y: 0 } };
    if (target.takeHit(blow, sweep.now, sweep.center).died) killed.push(target);
  }
  return { hit, killed };
}
