import type {
  AreaStrike,
  BossAttackPlan,
  BossDefinition,
  ProjectileBurst,
} from '@/core/bossTypes';
import { BossAttackKind } from '@/core/bossTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';

export interface AttackPlanContext {
  readonly kind: BossAttackKind;
  readonly definition: BossDefinition;
  readonly self: Vector2;
  readonly target: Vector2;
  readonly now: number;
  readonly enraged: boolean;
  readonly rng: Rng;
  /** Żywe pajączki z poprzednich wylęgów (limit `brood.maxAlive`). */
  readonly summonsAlive?: number;
}

/** Buduje plan ataku (strefy, fale pocisków, czasy). Czysta funkcja — poza RNG nie ma stanu. */
export function planBossAttack(ctx: AttackPlanContext): BossAttackPlan {
  switch (ctx.kind) {
    case BossAttackKind.Slam:
      return planSlam(ctx);
    case BossAttackKind.Nova:
      return planNova(ctx);
    case BossAttackKind.Barrage:
      return planBarrage(ctx);
    case BossAttackKind.Brood:
      return planBrood(ctx);
  }
}

/** Atak z `pattern` bez definicji to błąd konfiguracji bossa. */
function required<T>(value: T | undefined, kind: BossAttackKind, ctx: AttackPlanContext): T {
  if (value === undefined) throw new Error(`Boss „${ctx.definition.name}”: atak ${kind} bez definicji.`);
  return value;
}

function telegraph(ctx: AttackPlanContext, baseMs: number): number {
  return Math.round(baseMs * (ctx.enraged ? ctx.definition.enrage.telegraphMultiplier : 1));
}

function planSlam(ctx: AttackPlanContext): BossAttackPlan {
  const slam = required(ctx.definition.slam, BossAttackKind.Slam, ctx);
  const impactAt = ctx.now + telegraph(ctx, slam.telegraphMs);
  const strike: AreaStrike = {
    center: ctx.self,
    radius: slam.radius,
    telegraphStartAt: ctx.now,
    impactAt,
    damage: slam.damage,
    knockback: slam.knockback,
  };
  return { kind: BossAttackKind.Slam, strikes: [strike], bursts: [], spawns: [], endsAt: impactAt + slam.recoveryMs };
}

function planNova(ctx: AttackPlanContext): BossAttackPlan {
  const nova = required(ctx.definition.nova, BossAttackKind.Nova, ctx);
  const waves = nova.waves + (ctx.enraged ? 1 : 0);
  const firstFireAt = ctx.now + telegraph(ctx, nova.telegraphMs);
  const halfStep = Math.PI / nova.projectileCount;

  const bursts: ProjectileBurst[] = [];
  for (let wave = 0; wave < waves; wave++) {
    bursts.push({
      origin: ctx.self,
      count: nova.projectileCount,
      angleOffset: wave % 2 === 0 ? 0 : halfStep,
      speed: nova.projectileSpeed,
      damage: nova.damage,
      knockback: nova.knockback,
      lifetimeMs: nova.projectileLifetimeMs,
      telegraphStartAt: ctx.now,
      fireAt: firstFireAt + wave * nova.waveIntervalMs,
    });
  }
  const lastFireAt = firstFireAt + (waves - 1) * nova.waveIntervalMs;
  return { kind: BossAttackKind.Nova, strikes: [], bursts, spawns: [], endsAt: lastFireAt + nova.recoveryMs };
}

function planBarrage(ctx: AttackPlanContext): BossAttackPlan {
  const barrage = required(ctx.definition.barrage, BossAttackKind.Barrage, ctx);
  const firstImpactAt = ctx.now + telegraph(ctx, barrage.telegraphMs);
  const zoneCount = barrage.zoneCount + (ctx.enraged ? 1 : 0);

  const strikes: AreaStrike[] = [];
  for (let i = 0; i < zoneCount; i++) {
    // Pierwsza strefa celuje dokładnie w gracza, kolejne losowo wokół niego.
    const angle = ctx.rng.next() * Math.PI * 2;
    const offset = i === 0 ? 0 : barrage.spread * (0.4 + 0.6 * ctx.rng.next());
    strikes.push({
      center: { x: ctx.target.x + Math.cos(angle) * offset, y: ctx.target.y + Math.sin(angle) * offset },
      radius: barrage.zoneRadius,
      telegraphStartAt: ctx.now + i * barrage.intervalMs,
      impactAt: firstImpactAt + i * barrage.intervalMs,
      damage: barrage.damage,
      knockback: barrage.knockback,
    });
  }
  const lastImpactAt = firstImpactAt + (zoneCount - 1) * barrage.intervalMs;
  return { kind: BossAttackKind.Barrage, strikes, bursts: [], spawns: [], endsAt: lastImpactAt + barrage.recoveryMs };
}

/**
 * Wylęg: pajączki pojawiają się za bossem (po stronie przeciwnej do gracza) na końcu złożenia,
 * w wachlarzu `spreadDeg`. Liczba tylko do limitu żywych; przy pełnym limicie wylęg jest pusty
 * (boss i tak odczekuje swój rytm).
 */
function planBrood(ctx: AttackPlanContext): BossAttackPlan {
  const brood = required(ctx.definition.brood, BossAttackKind.Brood, ctx);
  const at = ctx.now + telegraph(ctx, brood.birthMs);
  const wanted = brood.count + (ctx.enraged ? 1 : 0);
  const count = Math.max(0, Math.min(wanted, brood.maxAlive - (ctx.summonsAlive ?? 0)));

  const dx = ctx.self.x - ctx.target.x;
  const dy = ctx.self.y - ctx.target.y;
  const back = dx === 0 && dy === 0 ? Math.PI / 2 : Math.atan2(dy, dx);
  const spread = (brood.spreadDeg * Math.PI) / 180;
  const spawns = Array.from({ length: count }, (_, i) => {
    const angle = count === 1 ? back : back - spread / 2 + (spread * i) / (count - 1);
    return {
      position: { x: ctx.self.x + Math.cos(angle) * brood.spawnDistance, y: ctx.self.y + Math.sin(angle) * brood.spawnDistance },
      at,
    };
  });
  return { kind: BossAttackKind.Brood, strikes: [], bursts: [], spawns, endsAt: at + brood.recoveryMs };
}

/** Czy okrągły cel zostaje trafiony przez strefę (okręgi się przecinają). */
export function isHitByAreaStrike(strike: AreaStrike, target: Vector2, targetRadius: number): boolean {
  return Math.hypot(target.x - strike.center.x, target.y - strike.center.y) <= strike.radius + targetRadius;
}

/**
 * Czas od `now` do pierwszego „wybuchu” ataku: wystrzału fali, uderzenia strefy albo wylęgu.
 * Warstwa widoku dopasowuje do niego animację ataku (np. plucie kończy się w chwili wystrzału).
 * 0, gdy plan nie ma żadnego zdarzenia albo pierwsze już minęło.
 */
export function attackLeadTimeMs(plan: BossAttackPlan, now: number): number {
  const moments = [
    ...plan.bursts.map((burst) => burst.fireAt),
    ...plan.strikes.map((strike) => strike.impactAt),
    ...plan.spawns.map((spawn) => spawn.at),
  ];
  if (moments.length === 0) return 0;
  return Math.max(0, Math.min(...moments) - now);
}
