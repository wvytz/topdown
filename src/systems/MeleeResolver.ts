import type { DamageResult, Hit, PlayerCombatConfig, StatusApplication } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { isInMeleeArc, knockbackFrom } from '@/systems/CombatMath';

/** Wszystko, co gracz może trafić (cios wręcz, strzał, dash): zwykły przeciwnik, boss, w przyszłości np. skrzynie. */
export interface MeleeTarget extends Vector2 {
  readonly radius: number;
  takeHit(hit: Hit, now: number, source: Vector2): DamageResult;
}

export interface MeleeSwing {
  readonly origin: Vector2;
  readonly angle: number;
  readonly combat: PlayerCombatConfig;
  readonly now: number;
  /** Statusy z przedmiotów (np. podpalenie). */
  readonly status?: StatusApplication;
}

export interface SwingResult<T> {
  readonly hit: readonly T[];
  readonly killed: readonly T[];
}

/** Zadaje obrażenia wszystkim celom w łuku. Zwraca trafione i zabite cele. */
export function resolveMeleeSwing<T extends MeleeTarget>(swing: MeleeSwing, targets: readonly T[]): SwingResult<T> {
  const { origin, angle, combat, now } = swing;
  const arc = (combat.meleeArcDeg * Math.PI) / 180;
  const source: Vector2 = { x: origin.x, y: origin.y };
  const hit: T[] = [];
  const killed: T[] = [];

  for (const target of targets) {
    if (!isInMeleeArc(origin, angle, arc, combat.meleeRange, target, target.radius)) continue;
    const blow: Hit = {
      damage: combat.meleeDamage,
      knockback: knockbackFrom(origin, target, combat.knockback),
      ...(swing.status && { status: swing.status }),
    };
    hit.push(target);
    if (target.takeHit(blow, now, source).died) killed.push(target);
  }
  return { hit, killed };
}
