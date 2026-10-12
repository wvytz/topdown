import type { DamageResult, Hit, PlayerCombatConfig } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { isInMeleeArc, knockbackFrom } from '@/systems/CombatMath';

/** Wszystko, co można trafić bronią wręcz: zwykły przeciwnik, boss, w przyszłości np. skrzynie. */
export interface MeleeTarget extends Vector2 {
  readonly radius: number;
  takeHit(hit: Hit, now: number, source: Vector2): DamageResult;
}

export interface MeleeSwing {
  readonly origin: Vector2;
  readonly angle: number;
  readonly combat: PlayerCombatConfig;
  readonly now: number;
}

/** Zadaje obrażenia wszystkim celom w łuku. Zwraca cele zabite tym ciosem. */
export function resolveMeleeSwing<T extends MeleeTarget>(swing: MeleeSwing, targets: readonly T[]): T[] {
  const { origin, angle, combat, now } = swing;
  const arc = (combat.meleeArcDeg * Math.PI) / 180;
  const source: Vector2 = { x: origin.x, y: origin.y };
  const killed: T[] = [];

  for (const target of targets) {
    if (!isInMeleeArc(origin, angle, arc, combat.meleeRange, target, target.radius)) continue;
    const hit: Hit = { damage: combat.meleeDamage, knockback: knockbackFrom(origin, target, combat.knockback) };
    if (target.takeHit(hit, now, source).died) killed.push(target);
  }
  return killed;
}
