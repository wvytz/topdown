import type { Hit } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { distance } from '@/systems/CombatMath';
import type { MeleeTarget, SwingResult } from '@/systems/MeleeResolver';

export interface DashSweep {
  readonly center: Vector2;
  readonly radius: number;
  readonly damage: number;
  readonly now: number;
}

/**
 * Burzowy pęd: gracz w trakcie dasha rani cele, których dotknie — każdy co najwyżej raz na dash.
 * `alreadyHit` należy do bieżącego dasha i jest uzupełniany o nowe trafienia. Bez odrzutu.
 */
export function resolveDashSweep<T extends MeleeTarget>(
  sweep: DashSweep,
  targets: readonly T[],
  alreadyHit: Set<object>,
): SwingResult<T> {
  const hit: T[] = [];
  const killed: T[] = [];
  if (sweep.damage <= 0) return { hit, killed };

  const blow: Hit = { damage: sweep.damage, knockback: { x: 0, y: 0 } };
  for (const target of targets) {
    if (alreadyHit.has(target) || distance(sweep.center, target) > sweep.radius + target.radius) continue;
    alreadyHit.add(target);
    hit.push(target);
    if (target.takeHit(blow, sweep.now, sweep.center).died) killed.push(target);
  }
  return { hit, killed };
}
