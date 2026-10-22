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

/** Czy cel jest w łuku ciosu (bez zadawania obrażeń). */
export function swingReaches(swing: MeleeSwing, target: MeleeTarget): boolean {
  const arc = (swing.combat.meleeArcDeg * Math.PI) / 180;
  return isInMeleeArc(swing.origin, swing.angle, arc, swing.combat.meleeRange, target, target.radius);
}

/** Zadaje obrażenia wszystkim celom w łuku. Zwraca trafione i zabite cele. */
export function resolveMeleeSwing<T extends MeleeTarget>(swing: MeleeSwing, targets: readonly T[]): SwingResult<T> {
  const { origin, combat, now } = swing;
  const source: Vector2 = { x: origin.x, y: origin.y };
  const hit: T[] = [];
  const killed: T[] = [];

  for (const target of targets) {
    if (!swingReaches(swing, target)) continue;
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
