import type {
  AreaStrike,
  BossAttackPlan,
  BossDefinition,
  ProjectileBurst,
  WebShot,
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
    case BossAttackKind.Web:
      return planWeb(ctx);
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
  return { kind: BossAttackKind.Slam, strikes: [strike], bursts: [], spawns: [], webs: [], endsAt: impactAt + slam.recoveryMs };
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
  return { kind: BossAttackKind.Nova, strikes: [], bursts, spawns: [], webs: [], endsAt: lastFireAt + nova.recoveryMs };
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
  return { kind: BossAttackKind.Barrage, strikes, bursts: [], spawns: [], webs: [], endsAt: lastImpactAt + barrage.recoveryMs };
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
  return { kind: BossAttackKind.Brood, strikes: [], bursts: [], spawns, webs: [], endsAt: at + brood.recoveryMs };
}

/**
 * Rzut siecią: miejsce lądowania `behindDistance` za graczem na linii boss → gracz (tam, dokąd gracz
 * ucieka); kolejne sieci w wachlarzu `fanDeg` wokół tego kierunku, w tej samej odległości od gracza.
 */
function planWeb(ctx: AttackPlanContext): BossAttackPlan {
  const web = required(ctx.definition.web, BossAttackKind.Web, ctx);
  const launchAt = ctx.now + telegraph(ctx, web.telegraphMs);
  const landAt = launchAt + web.flightMs;
  const count = web.count + (ctx.enraged ? 1 : 0);

  const dx = ctx.target.x - ctx.self.x;
  const dy = ctx.target.y - ctx.self.y;
  const away = dx === 0 && dy === 0 ? Math.PI / 2 : Math.atan2(dy, dx);
  const fan = (web.fanDeg * Math.PI) / 180;
  const webs: WebShot[] = Array.from({ length: count }, (_, i) => {
    const angle = count === 1 ? away : away - fan / 2 + (fan * i) / (count - 1);
    return {
      from: ctx.self,
      to: { x: ctx.target.x + Math.cos(angle) * web.behindDistance, y: ctx.target.y + Math.sin(angle) * web.behindDistance },
      telegraphStartAt: ctx.now,
      launchAt,
      landAt,
      startRadius: web.startRadius,
      maxRadius: web.maxRadius,
      spreadMs: web.spreadMs,
      expiresAt: landAt + web.durationMs,
      slow: web.slow,
    };
  });
  return { kind: BossAttackKind.Web, strikes: [], bursts: [], spawns: [], webs, endsAt: landAt + web.recoveryMs };
}

/** Promień plamy sieci w chwili `now` (0 przed wylądowaniem i po wygaśnięciu); rośnie liniowo przez `spreadMs`. */
export function webPatchRadius(web: WebShot, now: number): number {
  if (now < web.landAt || now >= web.expiresAt) return 0;
  const t = Math.min(1, (now - web.landAt) / web.spreadMs);
  return web.startRadius + (web.maxRadius - web.startRadius) * t;
}

/** Czy punkt (środek gracza) jest w plamie sieci. */
export function isInWebPatch(web: WebShot, point: Vector2, now: number): boolean {
  const r = webPatchRadius(web, now);
  return r > 0 && Math.hypot(point.x - web.to.x, point.y - web.to.y) <= r;
}

/** Postęp lotu kłębu sieci (0..1); poza lotem null. */
export function webFlightProgress(web: WebShot, now: number): number | null {
  if (now < web.launchAt || now >= web.landAt) return null;
  return (now - web.launchAt) / (web.landAt - web.launchAt);
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
    ...plan.webs.map((web) => web.launchAt),
  ];
  if (moments.length === 0) return 0;
  return Math.max(0, Math.min(...moments) - now);
}
