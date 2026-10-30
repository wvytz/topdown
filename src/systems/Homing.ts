/** Naprowadzanie pocisku gracza (krok 137): strzał barbarzyńcy skręca do najbliższego celu przed sobą. */
import type { Vector2 } from '@/core/types';
import { wrapAngle } from '@/systems/CombatMath';
import type { AimTarget } from '@/systems/touchAim';

export interface HomingConfig {
  /** Zasięg wypatrywania celu od pocisku (px, do brzegu celu). */
  readonly range: number;
  /** Połowa stożka przed pociskiem, w którym szuka celu (stopnie) — nie zawraca do wrogów za plecami. */
  readonly coneHalfDeg: number;
  /** Najszybszy skręt (stopnie na sekundę). */
  readonly turnRateDegPerSec: number;
}

/**
 * Cel naprowadzania: w stożku przed pociskiem i w zasięgu wygrywa ten, do którego trzeba skręcić najmniej
 * (przy równym kącie — bliższy). Null, gdy nikogo nie ma.
 */
export function pickHomingTarget(position: Vector2, velocity: Vector2, targets: Iterable<AimTarget>, config: HomingConfig): AimTarget | null {
  if (velocity.x === 0 && velocity.y === 0) return null;
  const heading = Math.atan2(velocity.y, velocity.x);
  const cone = (config.coneHalfDeg * Math.PI) / 180;
  let best: AimTarget | null = null;
  let bestScore = Infinity;
  for (const target of targets) {
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || dist - target.radius > config.range) continue;
    // Połowa kąta, pod jakim widać cel — duży boss łapie się z szerszego stożka.
    const halfSize = Math.asin(Math.min(1, target.radius / dist));
    const offset = Math.max(0, Math.abs(wrapAngle(Math.atan2(dy, dx) - heading)) - halfSize);
    if (offset > cone) continue;
    const score = offset + dist * 1e-6;
    if (score >= bestScore) continue;
    best = target;
    bestScore = score;
  }
  return best;
}

/**
 * Nowa prędkość pocisku: obrót w stronę celu o najwyżej `turnRate × dt`, ta sama szybkość.
 * Bez celu (albo przy zerowym kroku) prędkość się nie zmienia.
 */
export function steerVelocity(
  position: Vector2,
  velocity: Vector2,
  targets: Iterable<AimTarget>,
  config: HomingConfig,
  deltaMs: number,
): Vector2 {
  if (deltaMs <= 0) return velocity;
  const target = pickHomingTarget(position, velocity, targets, config);
  if (!target) return velocity;
  const speed = Math.hypot(velocity.x, velocity.y);
  const heading = Math.atan2(velocity.y, velocity.x);
  const wanted = Math.atan2(target.y - position.y, target.x - position.x);
  const maxTurn = ((config.turnRateDegPerSec * Math.PI) / 180) * (deltaMs / 1000);
  const turn = Math.max(-maxTurn, Math.min(maxTurn, wrapAngle(wanted - heading)));
  const angle = heading + turn;
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
}
