import type { AreaStrike, BossAttackPlan, ProjectileBurst, ThrownObject, WebShot } from '@/core/bossTypes';
import { BossAttackKind } from '@/core/bossTypes';
import type { Vector2 } from '@/core/types';
import type { AttackPlanContext } from '@/ai/bossAttacks';
import { EMPTY, required, telegraph, towardPoint } from '@/ai/planHelpers';

/**
 * Ataki Brudnej Wiedźmy (krok 137, szkic właściciela `#brudna-wiedzma`): klucz bocianów, pikowanie ptaków,
 * kwiat-oko i wir sukni. Czyste funkcje jak w `bossAttacks.ts` — poza RNG bez stanu.
 */

/**
 * Klucz bocianów: równoległe pasy w kierunku wiedźma → bohater; jeden zawsze przez bohatera, kolejne co `laneGap`
 * w poprzek (przy parzystej liczbie dodatkowy pas po losowej stronie). Telegraf to od razu cały pas cieni, a po nim
 * bocian przelatuje pas — strefa uderza, gdy bocian jest nad nią (dalsze później).
 */
export function planStorkFlight(ctx: AttackPlanContext): BossAttackPlan {
  const def = required(ctx.definition.storkFlight, BossAttackKind.StorkFlight, ctx);
  const flyAt = ctx.now + telegraph(ctx, def.telegraphMs);
  const lanes = def.lanes + (ctx.enraged ? 1 : 0);
  const dir = towardPoint(ctx.self, ctx.target);
  const across = { x: -dir.y, y: dir.x };
  const side = ctx.rng.next() < 0.5 ? 1 : -1;
  const middle = Math.floor((lanes - 1) / 2);
  const strikes: AreaStrike[] = [];
  const throws: ThrownObject[] = [];
  for (let lane = 0; lane < lanes; lane++) {
    const offset = side * (lane - middle) * def.laneGap;
    const start = {
      x: ctx.target.x + across.x * offset - (dir.x * def.length) / 2,
      y: ctx.target.y + across.y * offset - (dir.y * def.length) / 2,
    };
    for (let d = def.step / 2; d < def.length; d += def.step) {
      strikes.push({
        center: { x: start.x + dir.x * d, y: start.y + dir.y * d },
        radius: def.radius,
        telegraphStartAt: ctx.now,
        impactAt: flyAt + Math.round((def.flightMs * d) / def.length),
        damage: def.damage,
        knockback: def.knockback,
        look: 'feathers',
      });
    }
    const end = { x: start.x + dir.x * def.length, y: start.y + dir.y * def.length };
    throws.push({ look: 'stork', from: start, to: end, launchAt: flyAt, landAt: flyAt + def.flightMs });
  }
  return { kind: BossAttackKind.StorkFlight, ...EMPTY, strikes, throws, endsAt: flyAt + def.recoveryMs };
}

/**
 * Pikowanie: pierwsze miejsce na bohaterze, kolejne losowo wokół niego (jak ostrzał stref), każde znaczone od razu
 * po kolei co `intervalMs`. Ptak spada pionowo z wysokości `diveHeight` przez ostatnie `diveMs` przed uderzeniem.
 */
export function planBirdDive(ctx: AttackPlanContext): BossAttackPlan {
  const def = required(ctx.definition.birdDive, BossAttackKind.BirdDive, ctx);
  const firstImpactAt = ctx.now + telegraph(ctx, def.telegraphMs);
  const count = def.zoneCount + (ctx.enraged ? 1 : 0);
  const strikes: AreaStrike[] = [];
  const throws: ThrownObject[] = [];
  for (let i = 0; i < count; i++) {
    const angle = ctx.rng.next() * Math.PI * 2;
    const offset = i === 0 ? 0 : def.spread * (0.4 + 0.6 * ctx.rng.next());
    const center = { x: ctx.target.x + Math.cos(angle) * offset, y: ctx.target.y + Math.sin(angle) * offset };
    const impactAt = firstImpactAt + i * def.intervalMs;
    strikes.push({
      center,
      radius: def.zoneRadius,
      telegraphStartAt: ctx.now + i * def.intervalMs,
      impactAt,
      damage: def.damage,
      knockback: def.knockback,
      look: 'dive',
    });
    throws.push({ look: 'bird', from: { x: center.x, y: center.y - def.diveHeight }, to: center, launchAt: impactAt - def.diveMs, landAt: impactAt });
  }
  return { kind: BossAttackKind.BirdDive, ...EMPTY, strikes, throws, endsAt: strikes.at(-1)!.impactAt + def.recoveryMs };
}

/**
 * Kwiat-oko: nasiona lecą łukiem w losowe miejsca `distance` od bohatera; w chwili lądowania wyrasta kwiat (płat bez
 * żadnego działania, tylko wygląd), który pulsuje pierścieniami pyłku. Kolejne pulsy obrócone o pół kroku — bez stałych
 * „bezpiecznych” linii. Kwiat i pierścienie mają wspólny obiekt miejsca, więc warstwa gry przesuwa je razem.
 */
export function planFlowerEye(ctx: AttackPlanContext): BossAttackPlan {
  const def = required(ctx.definition.flowerEye, BossAttackKind.FlowerEye, ctx);
  const launchAt = ctx.now + telegraph(ctx, def.telegraphMs);
  const landAt = launchAt + def.flightMs;
  const count = def.count + (ctx.enraged ? 1 : 0);
  const halfStep = Math.PI / def.projectileCount;
  const lastPulseAt = landAt + def.firstPulseMs + (def.pulses - 1) * def.pulseIntervalMs;
  const throws: ThrownObject[] = [];
  const webs: WebShot[] = [];
  const bursts: ProjectileBurst[] = [];
  const start = ctx.rng.next() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    // Kwiaty rozstawione równo dookoła bohatera (od losowego kąta), żeby nie wyrastały jeden na drugim.
    const angle = start + (i * Math.PI * 2) / count;
    const dist = def.distance.min + (def.distance.max - def.distance.min) * ctx.rng.next();
    const spot: Vector2 = { x: ctx.target.x + Math.cos(angle) * dist, y: ctx.target.y + Math.sin(angle) * dist };
    throws.push({ look: 'seed', from: ctx.self, to: spot, launchAt, landAt });
    webs.push({
      from: spot,
      to: spot,
      telegraphStartAt: landAt,
      launchAt: landAt,
      landAt,
      startRadius: def.flower.startRadius,
      maxRadius: def.flower.maxRadius,
      spreadMs: def.flower.spreadMs,
      expiresAt: lastPulseAt + def.flower.lingerMs,
      look: 'flower',
    });
    const twist = ctx.rng.next() * halfStep;
    for (let pulse = 0; pulse < def.pulses; pulse++) {
      const fireAt = landAt + def.firstPulseMs + pulse * def.pulseIntervalMs;
      bursts.push({
        origin: spot,
        count: def.projectileCount,
        angleOffset: twist + (pulse % 2 === 0 ? 0 : halfStep),
        speed: def.projectileSpeed,
        damage: def.damage,
        knockback: def.knockback,
        lifetimeMs: def.projectileLifetimeMs,
        telegraphStartAt: fireAt - def.pulseTelegraphMs,
        fireAt,
        look: 'pollen',
      });
    }
  }
  return { kind: BossAttackKind.FlowerEye, ...EMPTY, throws, webs, bursts, endsAt: landAt + def.recoveryMs };
}

/** Wir sukni: fala wokół wiedźmy i w tej samej chwili pierścień liści (bez osobnego telegrafu — zapowiada go fala). */
export function planWhirl(ctx: AttackPlanContext): BossAttackPlan {
  const def = required(ctx.definition.whirl, BossAttackKind.Whirl, ctx);
  const impactAt = ctx.now + telegraph(ctx, def.telegraphMs);
  const strike: AreaStrike = {
    center: ctx.self,
    radius: def.radius,
    telegraphStartAt: ctx.now,
    impactAt,
    damage: def.damage,
    knockback: def.knockback,
    look: 'whirl',
  };
  const burst: ProjectileBurst = {
    origin: ctx.self,
    count: def.projectileCount,
    angleOffset: ctx.rng.next() * ((Math.PI * 2) / def.projectileCount),
    speed: def.projectileSpeed,
    damage: def.damage,
    knockback: def.knockback,
    lifetimeMs: def.projectileLifetimeMs,
    telegraphStartAt: impactAt,
    fireAt: impactAt,
    look: 'leaf',
  };
  return { kind: BossAttackKind.Whirl, ...EMPTY, strikes: [strike], bursts: [burst], endsAt: impactAt + def.recoveryMs };
}
