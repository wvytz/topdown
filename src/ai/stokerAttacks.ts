import type { AreaStrike, BossAttackPlan, GrateRow, OverheatVentDefinition } from '@/core/bossTypes';
import { BossAttackKind } from '@/core/bossTypes';
import type { Vector2 } from '@/core/types';
import type { AttackPlanContext } from '@/ai/bossAttacks';
import { EMPTY, required, telegraph } from '@/ai/planHelpers';

/**
 * Ataki Palacza (krok 182, `#palacz`): ruszt w posadzce i buchnięcie przegrzanego pieca. Czyste funkcje.
 * Szufla żaru to `Barrage` z rzutem bryłami (`thrown.look: 'coal'`), zamach szuflą — `Cleave`, piec na plecach — `Slam`.
 */

/**
 * Ruszt: buchają wszystkie kafle zestawu `ctx.grateSet` (domyślnie 0). We wściekłości drugi zestaw buchnie
 * `enragedFollowMs` później — jego telegraf zaczyna się, gdy pierwszy uderza (gracz widzi, dokąd uciec).
 * Bez rusztów na arenie plan jest pusty (sama przerwa).
 */
export function planGrate(ctx: AttackPlanContext): BossAttackPlan {
  const grate = required(ctx.definition.grate, BossAttackKind.Grate, ctx);
  const rows = ctx.grates ?? [];
  const first: 0 | 1 = ctx.grateSet ?? 0;
  const impactAt = ctx.now + telegraph(ctx, grate.telegraphMs);
  const strikes: AreaStrike[] = [...grateStrikes(rows, first, ctx.now, impactAt, grate)];
  let lastImpactAt = impactAt;
  if (ctx.enraged) {
    lastImpactAt = impactAt + grate.enragedFollowMs;
    strikes.push(...grateStrikes(rows, first === 0 ? 1 : 0, impactAt, lastImpactAt, grate));
  }
  return { kind: BossAttackKind.Grate, ...EMPTY, strikes, endsAt: lastImpactAt + grate.recoveryMs };
}

function grateStrikes(
  rows: readonly GrateRow[],
  set: 0 | 1,
  telegraphStartAt: number,
  impactAt: number,
  grate: { readonly radius: number; readonly damage: number; readonly knockback: number },
): AreaStrike[] {
  return rows
    .filter((row) => row.set === set)
    .flatMap((row) =>
      row.points.map((center) => ({ center, radius: grate.radius, telegraphStartAt, impactAt, damage: grate.damage, knockback: grate.knockback, look: 'grate' as const })),
    );
}

/**
 * Buchnięcie przegrzanego pieca: trzy smugi stref przed bossem (kąt `facing`, radiany) — środkowa i dwie
 * odchylone o `spreadDeg`. Każda od krawędzi bossa (`bossRadius`) do `length`, promień rośnie z dystansem.
 */
export function planOverheatVent(self: Vector2, facing: number, bossRadius: number, vent: OverheatVentDefinition, now: number): AreaStrike[] {
  const impactAt = now + vent.telegraphMs;
  const spread = (vent.spreadDeg * Math.PI) / 180;
  const strikes: AreaStrike[] = [];
  for (const angle of [facing - spread, facing, facing + spread]) {
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const start = bossRadius + vent.startRadius;
    for (let d = start; d <= vent.length; d += vent.step) {
      const t = Math.min(1, (d - start) / Math.max(1, vent.length - start));
      strikes.push({
        center: { x: self.x + dir.x * d, y: self.y + dir.y * d },
        radius: vent.startRadius + (vent.endRadius - vent.startRadius) * t,
        telegraphStartAt: now,
        impactAt,
        damage: vent.damage,
        knockback: vent.knockback,
        look: 'embers',
      });
    }
  }
  return strikes;
}
