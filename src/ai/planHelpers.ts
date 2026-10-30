import type { BossAttackKind } from '@/core/bossTypes';
import type { Vector2 } from '@/core/types';
import type { AttackPlanContext } from '@/ai/bossAttacks';

/** Wspólne kawałki planowania ataków bossów (wydzielone w kroku 137 z `bossAttacks.ts`). */

/** Puste listy planu — atak dopisuje tylko to, czego używa. */
export const EMPTY = { strikes: [], bursts: [], spawns: [], webs: [], leap: null, throws: [] } as const;

/** Atak z `pattern` bez definicji to błąd konfiguracji bossa. */
export function required<T>(value: T | undefined, kind: BossAttackKind, ctx: AttackPlanContext): T {
  if (value === undefined) throw new Error(`Boss „${ctx.definition.name}”: atak ${kind} bez definicji.`);
  return value;
}

/** Czas telegrafu, skrócony we wściekłości. */
export function telegraph(ctx: AttackPlanContext, baseMs: number): number {
  return Math.round(baseMs * (ctx.enraged ? ctx.definition.enrage.telegraphMultiplier : 1));
}

/** Kierunek jednostkowy `from` → `to`; w tym samym punkcie — na południe. */
export function towardPoint(from: Vector2, to: Vector2): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 0, y: 1 } : { x: dx / len, y: dy / len };
}
