import type {
  AreaStrike,
  BossAttackPlan,
  BossLeap,
  ThrownObject,
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
    case BossAttackKind.Leap:
      return planLeap(ctx);
    case BossAttackKind.Lash:
      return planLash(ctx);
    case BossAttackKind.Flurry:
      return planFlurry(ctx);
    case BossAttackKind.CocoonThrow:
      return planCocoonThrow(ctx);
    case BossAttackKind.Bloom:
      return planBloom(ctx);
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
  return { kind: BossAttackKind.Slam, strikes: [strike], bursts: [], spawns: [], webs: [], leap: null, throws: [], endsAt: impactAt + slam.recoveryMs };
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
  return { kind: BossAttackKind.Nova, strikes: [], bursts, spawns: [], webs: [], leap: null, throws: [], endsAt: lastFireAt + nova.recoveryMs };
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
  return { kind: BossAttackKind.Barrage, strikes, bursts: [], spawns: [], webs: [], leap: null, throws: [], endsAt: lastImpactAt + barrage.recoveryMs };
}

/**
 * Wylęg z sufitu: po zewie (`birthMs`) pajączki spadają po kolei co `dropIntervalMs`, pierścieniem
 * `ringRadius` wokół gracza — kąty równo podzielone (od losowego początku, z odchyleniem `ringJitterDeg`),
 * więc gracz jest osaczony ze wszystkich stron. Miejsce to przesunięcie względem gracza z chwili
 * pojawienia się cienia. Liczba tylko do limitu żywych; przy pełnym limicie wylęg jest pusty.
 */
function planBrood(ctx: AttackPlanContext): BossAttackPlan {
  const brood = required(ctx.definition.brood, BossAttackKind.Brood, ctx);
  const firstShadowAt = ctx.now + telegraph(ctx, brood.birthMs);
  const wanted = brood.count + (ctx.enraged ? 1 : 0);
  const count = Math.max(0, Math.min(wanted, brood.maxAlive - (ctx.summonsAlive ?? 0)));

  const start = ctx.rng.next() * Math.PI * 2;
  const jitter = (brood.ringJitterDeg * Math.PI) / 180;
  const spawns = Array.from({ length: count }, (_, i) => {
    const angle = start + (i * Math.PI * 2) / count + (ctx.rng.next() * 2 - 1) * jitter;
    const telegraphStartAt = firstShadowAt + i * brood.dropIntervalMs;
    return {
      offset: { x: Math.cos(angle) * brood.ringRadius, y: Math.sin(angle) * brood.ringRadius },
      telegraphStartAt,
      at: telegraphStartAt + brood.fallMs,
    };
  });
  const lastLandAt = spawns.at(-1)?.at ?? firstShadowAt;
  return { kind: BossAttackKind.Brood, strikes: [], bursts: [], spawns, webs: [], leap: null, throws: [], endsAt: lastLandAt + brood.recoveryMs };
}

/**
 * Królewski skok: od razu znacznik strefy lądowania na miejscu gracza (z chwili planu), po przysiadzie
 * (`telegraphMs`) lot `flightMs`, przy lądowaniu fala `radius`. Po lądowaniu boss stoi `recoveryMs` —
 * okno na kontrę wręcz.
 */
function planLeap(ctx: AttackPlanContext): BossAttackPlan {
  const leapDef = required(ctx.definition.leap, BossAttackKind.Leap, ctx);
  const launchAt = ctx.now + telegraph(ctx, leapDef.telegraphMs);
  const landAt = launchAt + leapDef.flightMs;
  const leap: BossLeap = { from: ctx.self, to: ctx.target, telegraphStartAt: ctx.now, launchAt, landAt };
  const strike: AreaStrike = {
    center: ctx.target,
    radius: leapDef.radius,
    telegraphStartAt: ctx.now,
    impactAt: landAt,
    damage: leapDef.damage,
    knockback: leapDef.knockback,
  };
  return { kind: BossAttackKind.Leap, strikes: [strike], bursts: [], spawns: [], webs: [], leap, throws: [], endsAt: landAt + leapDef.recoveryMs };
}

/**
 * Smagnięcie nogami: strefa `radius` przed bossem (środek `reach` px w stronę gracza), uderza po
 * `telegraphMs` i zatruwa trafionego gracza.
 */
function planLash(ctx: AttackPlanContext): BossAttackPlan {
  const lash = required(ctx.definition.lash, BossAttackKind.Lash, ctx);
  const impactAt = ctx.now + telegraph(ctx, lash.telegraphMs);
  const dx = ctx.target.x - ctx.self.x;
  const dy = ctx.target.y - ctx.self.y;
  const len = Math.hypot(dx, dy);
  const dir = len === 0 ? { x: 0, y: 1 } : { x: dx / len, y: dy / len };
  const strike: AreaStrike = {
    center: { x: ctx.self.x + dir.x * lash.reach, y: ctx.self.y + dir.y * lash.reach },
    radius: lash.radius,
    telegraphStartAt: ctx.now,
    impactAt,
    damage: lash.damage,
    knockback: lash.knockback,
    status: lash.status,
  };
  return { kind: BossAttackKind.Lash, strikes: [strike], bursts: [], spawns: [], webs: [], leap: null, throws: [], endsAt: impactAt + lash.recoveryMs };
}

/** Kierunek boss → gracz (jednostkowy); gracz w miejscu bossa: w dół. */
function towardTarget(ctx: AttackPlanContext): { x: number; y: number } {
  const dx = ctx.target.x - ctx.self.x;
  const dy = ctx.target.y - ctx.self.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 0, y: 1 } : { x: dx / len, y: dy / len };
}

/**
 * Grad sztyletów (Król): ukłucia w linii boss → gracz (kierunek z chwili planu), od `startDistance`
 * co `step` px, jedno po drugim co `intervalMs`. Po wściekłości dwa ukłucia więcej (dalej).
 */
function planFlurry(ctx: AttackPlanContext): BossAttackPlan {
  const flurry = required(ctx.definition.flurry, BossAttackKind.Flurry, ctx);
  const firstImpactAt = ctx.now + telegraph(ctx, flurry.telegraphMs);
  const count = flurry.count + (ctx.enraged ? 2 : 0);
  const dir = towardTarget(ctx);
  const strikes: AreaStrike[] = Array.from({ length: count }, (_, i) => {
    const d = flurry.startDistance + i * flurry.step;
    return {
      center: { x: ctx.self.x + dir.x * d, y: ctx.self.y + dir.y * d },
      radius: flurry.radius,
      telegraphStartAt: ctx.now + i * flurry.intervalMs,
      impactAt: firstImpactAt + i * flurry.intervalMs,
      damage: flurry.damage,
      knockback: flurry.knockback,
    };
  });
  const lastImpactAt = strikes.at(-1)?.impactAt ?? firstImpactAt;
  return { kind: BossAttackKind.Flurry, strikes, bursts: [], spawns: [], webs: [], leap: null, throws: [], endsAt: lastImpactAt + flurry.recoveryMs };
}

/**
 * Rzut kokonem (Król): kokon leci na miejsce gracza z chwili planu (strefa lądowania widoczna od razu),
 * przy lądowaniu obrażenia i paraliż. Po wściekłości dodatkowy kokon `behindDistance` za graczem
 * (w drodze ucieczki, jak sieć Matki Pająków).
 */
function planCocoonThrow(ctx: AttackPlanContext): BossAttackPlan {
  const def = required(ctx.definition.cocoonThrow, BossAttackKind.CocoonThrow, ctx);
  const launchAt = ctx.now + telegraph(ctx, def.telegraphMs);
  const landAt = launchAt + def.flightMs;
  const dir = towardTarget(ctx);
  const count = def.count + (ctx.enraged ? 1 : 0);
  const targets = Array.from({ length: count }, (_, i) =>
    i === 0 ? ctx.target : { x: ctx.target.x + dir.x * def.behindDistance, y: ctx.target.y + dir.y * def.behindDistance },
  );
  const throws: ThrownObject[] = targets.map((to) => ({ from: ctx.self, to, launchAt, landAt }));
  const strikes: AreaStrike[] = targets.map((center) => ({
    center,
    radius: def.radius,
    telegraphStartAt: ctx.now,
    impactAt: landAt,
    damage: def.damage,
    knockback: def.knockback,
    status: { paralysis: def.paralysis },
  }));
  return { kind: BossAttackKind.CocoonThrow, strikes, bursts: [], spawns: [], webs: [], leap: null, throws, endsAt: landAt + def.recoveryMs };
}

/**
 * Wysyp grzybni (Król): pierwszy płat pod graczem, kolejne w losowych miejscach `ring` px wokół niego.
 * Płaty to ten sam mechanizm co sieć Matki Pająków (rośnie, leży, spowalnia), ale bez lotu i z trucizną.
 * Po wściekłości jeden płat więcej.
 */
function planBloom(ctx: AttackPlanContext): BossAttackPlan {
  const bloom = required(ctx.definition.bloom, BossAttackKind.Bloom, ctx);
  const landAt = ctx.now + telegraph(ctx, bloom.telegraphMs);
  const count = bloom.count + (ctx.enraged ? 1 : 0);
  const webs: WebShot[] = Array.from({ length: count }, (_, i) => {
    const angle = ctx.rng.next() * Math.PI * 2;
    const dist = i === 0 ? 0 : bloom.ring.min + ctx.rng.next() * (bloom.ring.max - bloom.ring.min);
    const to = { x: ctx.target.x + Math.cos(angle) * dist, y: ctx.target.y + Math.sin(angle) * dist };
    return {
      from: to,
      to,
      telegraphStartAt: ctx.now,
      launchAt: landAt,
      landAt,
      startRadius: bloom.startRadius,
      maxRadius: bloom.maxRadius,
      spreadMs: bloom.spreadMs,
      expiresAt: landAt + bloom.durationMs,
      slow: bloom.slow,
      look: 'mycelium',
      status: { poison: bloom.poison },
    };
  });
  return { kind: BossAttackKind.Bloom, strikes: [], bursts: [], spawns: [], webs, leap: null, throws: [], endsAt: landAt + bloom.recoveryMs };
}

/** Postęp lotu skoku (0..1); poza lotem null. */
export function leapProgress(leap: BossLeap, now: number): number | null {
  if (now < leap.launchAt || now >= leap.landAt) return null;
  return (now - leap.launchAt) / (leap.landAt - leap.launchAt);
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
  return { kind: BossAttackKind.Web, strikes: [], bursts: [], spawns: [], webs, leap: null, throws: [], endsAt: landAt + web.recoveryMs };
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
 * Czas od `now` do pierwszego „wybuchu” ataku: wystrzału fali, uderzenia strefy, pierwszego cienia
 * wylęgu, rzutu sieci albo wybicia do skoku.
 * Warstwa widoku dopasowuje do niego animację ataku (np. plucie kończy się w chwili wystrzału).
 * 0, gdy plan nie ma żadnego zdarzenia albo pierwsze już minęło.
 */
export function attackLeadTimeMs(plan: BossAttackPlan, now: number): number {
  const moments = [
    ...plan.bursts.map((burst) => burst.fireAt),
    ...plan.strikes.map((strike) => strike.impactAt),
    ...plan.spawns.map((spawn) => spawn.telegraphStartAt),
    ...plan.webs.map((web) => web.launchAt),
    ...(plan.leap ? [plan.leap.launchAt] : []),
    ...plan.throws.map((thrown) => thrown.launchAt),
  ];
  if (moments.length === 0) return 0;
  return Math.max(0, Math.min(...moments) - now);
}
