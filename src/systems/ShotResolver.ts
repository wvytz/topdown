import type { Hit } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { distance, knockbackFrom } from '@/systems/CombatMath';
import type { MeleeTarget } from '@/systems/MeleeResolver';

/** Lecący pocisk gracza w danej klatce. */
export interface PlayerShot {
  readonly position: Vector2;
  readonly velocity: Vector2;
  readonly radius: number;
  /** Miejsce wystrzału — trafiony wróg „słyszy” strzelca stamtąd. */
  readonly origin: Vector2;
  readonly damage: number;
  readonly knockback: number;
  readonly now: number;
}

export interface ShotResult<T> {
  readonly target: T;
  readonly died: boolean;
}

/**
 * Pocisk gracza trafia najbliższy cel, z którym się styka (tylko jeden — pocisk znika).
 * Odrzut działa w kierunku lotu. Zwraca null, gdy nic nie trafił.
 */
export function resolvePlayerShot<T extends MeleeTarget>(shot: PlayerShot, targets: readonly T[]): ShotResult<T> | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    const d = distance(shot.position, target);
    if (d <= shot.radius + target.radius && d < bestDistance) {
      best = target;
      bestDistance = d;
    }
  }
  if (!best) return null;

  const behind: Vector2 = { x: shot.position.x - shot.velocity.x, y: shot.position.y - shot.velocity.y };
  const hit: Hit = { damage: shot.damage, knockback: knockbackFrom(behind, best, shot.knockback) };
  return { target: best, died: best.takeHit(hit, shot.now, shot.origin).died };
}
