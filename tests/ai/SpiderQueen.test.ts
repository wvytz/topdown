import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import { pixel, readPng } from '../helpers/png';
import { BossBrain } from '@/ai/BossBrain';
import { attackLeadTimeMs, isInWebPatch, leapProgress, planBossAttack, webFlightProgress, webPatchRadius } from '@/ai/bossAttacks';
import { SpiderlingBrain, SpiderlingPhase } from '@/ai/SpiderlingBrain';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import { createRng } from '@/core/random';
import { FLOOR_GUARDIAN, SPIDER_QUEEN as QUEEN, bossForFloor, scaleBossForFloor } from '@/config/bossConfig';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { ITEM_EFFECTS } from '@/config/lootConfig';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { scaleForFloor } from '@/systems/CombatMath';

const SELF = { x: 0, y: 0 };
const PLAYER_EAST = { x: 200, y: 0 };
const FRAME = 16;

function brood(now: number, options: { enraged?: boolean; summonsAlive?: number; target?: { x: number; y: number } } = {}) {
  return planBossAttack({
    kind: BossAttackKind.Brood,
    definition: QUEEN,
    self: SELF,
    target: options.target ?? PLAYER_EAST,
    now,
    enraged: options.enraged ?? false,
    rng: createRng(1),
    summonsAlive: options.summonsAlive ?? 0,
  });
}

describe('Matka Pająków — wylęg z sufitu (krok 26)', () => {
  const B = QUEEN.brood;

  it('po zewie pajączki spadają po kolei, pierścieniem wokół gracza', () => {
    const plan = brood(1000);
    expect(plan.spawns).toHaveLength(B.count);
    expect(plan.strikes).toHaveLength(0);
    expect(plan.bursts).toHaveLength(0);
    plan.spawns.forEach((spawn, i) => {
      expect(spawn.telegraphStartAt).toBe(1000 + B.birthMs + i * B.dropIntervalMs);
      expect(spawn.at).toBe(spawn.telegraphStartAt + B.fallMs);
      expect(Math.hypot(spawn.offset.x, spawn.offset.y)).toBeCloseTo(B.ringRadius);
    });
    expect(plan.endsAt).toBe(plan.spawns.at(-1)!.at + B.recoveryMs);
    expect(attackLeadTimeMs(plan, 1000)).toBe(B.birthMs);
  });

  it('osaczenie: pajączki z każdej strony — żadna luka w pierścieniu nie jest większa niż połowa okręgu', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const plan = planBossAttack({ kind: BossAttackKind.Brood, definition: QUEEN, self: SELF, target: PLAYER_EAST, now: 0, enraged: false, rng: createRng(seed) });
      const angles = plan.spawns.map((s) => Math.atan2(s.offset.y, s.offset.x)).sort((a, b) => a - b);
      const gaps = angles.map((a, i) => (i === 0 ? a + Math.PI * 2 - angles.at(-1)! : a - angles[i - 1]!));
      const maxGap = (Math.PI * 2) / B.count + (2 * B.ringJitterDeg * Math.PI) / 180;
      for (const gap of gaps) expect(gap).toBeLessThanOrEqual(maxGap + 1e-9);
      expect(Math.max(...gaps)).toBeLessThan(Math.PI);
    }
  });

  it('wściekłość: o jeden pajączek więcej i krótszy zew', () => {
    const plan = brood(0, { enraged: true });
    expect(plan.spawns).toHaveLength(B.count + 1);
    expect(plan.spawns[0]!.telegraphStartAt).toBe(Math.round(B.birthMs * QUEEN.enrage.telegraphMultiplier));
  });

  it('limit żywych: wylęg dokłada tylko do maxAlive, przy pełnym limicie jest pusty', () => {
    expect(brood(0, { summonsAlive: B.maxAlive - 1 }).spawns).toHaveLength(1);
    expect(brood(0, { summonsAlive: B.maxAlive }).spawns).toHaveLength(0);
  });

  it('balans: pajączek ląduje poza zasięgiem zapłonu, a cień daje czas na reakcję', () => {
    expect(B.ringRadius).toBeGreaterThan(QUEEN.spiderling.primeRange);
    // Gracz w czasie cienia może uciec dalej, niż wynosi pierścień (pierścień „goni” go kolejnymi cieniami).
    expect((PLAYER_BASE_STATS.moveSpeed * B.fallMs) / 1000).toBeGreaterThan(B.ringRadius);
  });

  it('BossBrain: zew, sieć i skok (każdy raz na rundę) w stałym rytmie; boss idzie do gracza', () => {
    const brain = new BossBrain(QUEEN, createRng(1));
    brain.activate(0);
    const starts: Array<{ kind: BossAttackKind; at: number; endsAt: number }> = [];
    for (let now = 0; now < 20_000; now += FRAME) {
      const decision = brain.think({ self: SELF, target: { x: 100, y: 0 }, now, hpRatio: 1, summonsAlive: 0 });
      if (decision.newAttack) starts.push({ kind: decision.newAttack.kind, at: now, endsAt: decision.newAttack.endsAt });
      if (!decision.newAttack && decision.speed > 0) expect(decision.move.x).toBeCloseTo(1); // idzie do gracza
    }
    expect(starts.length).toBeGreaterThanOrEqual(6);
    expect(starts[0]!.kind).toBe(BossAttackKind.Brood);
    const sorted = [...QUEEN.pattern].sort();
    expect(starts.slice(0, 3).map((s) => s.kind).sort()).toEqual(sorted);
    expect(starts.slice(3, 6).map((s) => s.kind).sort()).toEqual(sorted);
    for (let i = 1; i < starts.length; i++) {
      const rhythm = starts[i - 1]!.endsAt + QUEEN.restBetweenAttacksMs;
      expect(starts[i]!.at).toBeGreaterThanOrEqual(rhythm);
      expect(starts[i]!.at).toBeLessThan(rhythm + FRAME);
    }
  });

  it('nie atakuje Strażnikowymi atakami bez ich definicji (błąd konfiguracji jest głośny)', () => {
    expect(() =>
      planBossAttack({ kind: BossAttackKind.Slam, definition: QUEEN, self: SELF, target: PLAYER_EAST, now: 0, enraged: false, rng: createRng(1) }),
    ).toThrow(/slam/);
  });
});

describe('Matka Pająków — rzut siecią (krok 25)', () => {
  const W = QUEEN.web;
  const web = (now: number, enraged = false, target = PLAYER_EAST) =>
    planBossAttack({ kind: BossAttackKind.Web, definition: QUEEN, self: SELF, target, now, enraged, rng: createRng(1) });

  it('sieć ląduje behindDistance ZA graczem (po stronie przeciwnej do bossa), po zamachu i locie', () => {
    const plan = web(1000);
    expect(plan.webs).toHaveLength(W.count);
    const shot = plan.webs[0]!;
    expect(shot.to.x).toBeCloseTo(PLAYER_EAST.x + W.behindDistance);
    expect(shot.to.y).toBeCloseTo(0);
    expect(shot.launchAt).toBe(1000 + W.telegraphMs);
    expect(shot.landAt).toBe(shot.launchAt + W.flightMs);
    expect(shot.expiresAt).toBe(shot.landAt + W.durationMs);
    expect(plan.endsAt).toBe(shot.landAt + W.recoveryMs);
    expect(attackLeadTimeMs(plan, 1000)).toBe(W.telegraphMs);
  });

  it('wściekłość: o jedną sieć więcej, w wachlarzu za graczem, i krótszy zamach', () => {
    const plan = web(0, true);
    expect(plan.webs).toHaveLength(W.count + 1);
    for (const shot of plan.webs) {
      expect(Math.hypot(shot.to.x - PLAYER_EAST.x, shot.to.y - PLAYER_EAST.y)).toBeCloseTo(W.behindDistance);
      expect(shot.to.x).toBeGreaterThan(PLAYER_EAST.x); // zawsze za graczem
    }
    const [a, b] = plan.webs;
    const angle = (s: typeof a) => Math.atan2(s!.to.y - PLAYER_EAST.y, s!.to.x - PLAYER_EAST.x);
    expect(Math.abs(angle(a) - angle(b)) * (180 / Math.PI)).toBeCloseTo(W.fanDeg);
    expect(a!.launchAt).toBe(Math.round(W.telegraphMs * QUEEN.enrage.telegraphMultiplier));
  });

  it('gracz w miejscu bossa: rzut i tak ma kierunek', () => {
    expect(web(0, false, SELF).webs[0]!.to).not.toEqual(SELF);
  });

  it('plama: brak w locie, rośnie od startRadius do maxRadius, potem leży do wygaśnięcia', () => {
    const shot = web(0).webs[0]!;
    expect(webPatchRadius(shot, shot.landAt - 1)).toBe(0);
    expect(webFlightProgress(shot, shot.launchAt)).toBe(0);
    expect(webFlightProgress(shot, shot.landAt)).toBeNull();
    expect(webPatchRadius(shot, shot.landAt)).toBe(W.startRadius);
    expect(webPatchRadius(shot, shot.landAt + W.spreadMs / 2)).toBeCloseTo((W.startRadius + W.maxRadius) / 2);
    expect(webPatchRadius(shot, shot.landAt + W.spreadMs)).toBe(W.maxRadius);
    expect(webPatchRadius(shot, shot.expiresAt)).toBe(0);
    const edge = { x: shot.to.x + W.maxRadius, y: shot.to.y };
    expect(isInWebPatch(shot, edge, shot.landAt)).toBe(false);
    expect(isInWebPatch(shot, edge, shot.landAt + W.spreadMs)).toBe(true);
  });

  it('balans: sieć odcina ucieczkę — gracz uciekający od bossa wbiega w plamę', () => {
    // Gracz ucieka od bossa przez cały zamach i lot (bez dasha) — plama po rozroście sięga jego drogi.
    const shot = web(0).webs[0]!;
    const run = (PLAYER_BASE_STATS.moveSpeed * shot.landAt) / 1000;
    expect(Math.abs(run - W.behindDistance)).toBeLessThan(W.maxRadius);
    // Plama nie ląduje na graczu, który stoi — ma czas zareagować.
    expect(W.behindDistance).toBeGreaterThan(W.startRadius + 12);
  });
});

describe('Matka Pająków — królewski skok (krok 26)', () => {
  const L = QUEEN.leap;
  const leap = (now: number, enraged = false) =>
    planBossAttack({ kind: BossAttackKind.Leap, definition: QUEEN, self: SELF, target: PLAYER_EAST, now, enraged, rng: createRng(1) });

  it('przysiad, lot na miejsce gracza i fala przy lądowaniu', () => {
    const plan = leap(1000);
    const jump = plan.leap!;
    expect(jump.from).toEqual(SELF);
    expect(jump.to).toEqual(PLAYER_EAST);
    expect(jump.launchAt).toBe(1000 + L.telegraphMs);
    expect(jump.landAt).toBe(jump.launchAt + L.flightMs);
    expect(plan.strikes).toEqual([
      { center: PLAYER_EAST, radius: L.radius, telegraphStartAt: 1000, impactAt: jump.landAt, damage: L.damage, knockback: L.knockback },
    ]);
    expect(plan.endsAt).toBe(jump.landAt + L.recoveryMs);
    expect(attackLeadTimeMs(plan, 1000)).toBe(L.telegraphMs);
    expect(leapProgress(jump, jump.launchAt - 1)).toBeNull();
    expect(leapProgress(jump, jump.launchAt + L.flightMs / 2)).toBeCloseTo(0.5);
    expect(leapProgress(jump, jump.landAt)).toBeNull();
  });

  it('wściekłość: krótszy przysiad', () => {
    expect(leap(0, true).leap!.launchAt).toBe(Math.round(L.telegraphMs * QUEEN.enrage.telegraphMultiplier));
  });

  it('balans: uważny gracz zdąży wyjść ze strefy, stojący dostaje', () => {
    const plan = leap(0, true);
    const escape = (PLAYER_BASE_STATS.moveSpeed * (plan.strikes[0]!.impactAt - 300)) / 1000; // reakcja 300 ms
    expect(escape).toBeGreaterThan(L.radius + 12);
    expect(L.damage).toBeGreaterThan(0);
  });
});

describe('Matka Pająków — pościg i smagnięcie nogami (krok 27)', () => {
  const L = QUEEN.lash;
  const think = (brain: BossBrain, gap: number, now: number) =>
    brain.think({ self: SELF, target: { x: gap, y: 0 }, now, hpRatio: 1, summonsAlive: 0 });
  /** Mózg w walce, z atakiem ze wzoru odsuniętym daleko (sprawdzamy sam ruch i smagnięcie). */
  const hunting = () => {
    const brain = new BossBrain(QUEEN, createRng(1));
    brain.activate(-1_000_000);
    brain.delay(1_000_000_000);
    return brain;
  };

  it('z daleka sprint, bliżej chód, przy graczu stoi', () => {
    const brain = hunting();
    const far = think(brain, QUEEN.sprint.distance + 50, 0);
    expect(far.speed).toBe(QUEEN.sprint.speed);
    expect(far.move.x).toBeCloseTo(1);
    expect(think(brain, QUEEN.sprint.distance - 10, 16).speed).toBe(QUEEN.moveSpeed);
    // Tuż przy graczu (bliżej niż engageDistance, ale poza zasięgiem smagnięcia nie da się być — smaga).
    expect(QUEEN.engageDistance).toBeLessThan(L.triggerRange);
  });

  it('sprint wolniejszy niż gracz, ale szybszy niż gracz spowolniony siecią', () => {
    expect(QUEEN.sprint.speed).toBeLessThan(PLAYER_BASE_STATS.moveSpeed);
    expect(QUEEN.sprint.speed).toBeGreaterThan(PLAYER_BASE_STATS.moveSpeed * (1 - QUEEN.web.slow.pct));
  });

  it('gracz w zasięgu nóg: smagnięcie przed królową, zatruwa jak Ognista pięść', () => {
    const plan = think(hunting(), 50, 1000).newAttack!;
    expect(plan.kind).toBe(BossAttackKind.Lash);
    const strike = plan.strikes[0]!;
    expect(strike.center).toEqual({ x: L.reach, y: 0 });
    expect(strike.radius).toBe(L.radius);
    expect(strike.impactAt).toBe(1000 + L.telegraphMs);
    expect(strike.status?.poison).toEqual({
      tickDamage: ITEM_EFFECTS.fireFist.tickDamage,
      tickMs: ITEM_EFFECTS.fireFist.tickMs,
      durationMs: ITEM_EFFECTS.fireFist.durationMs,
    });
    expect(plan.endsAt).toBe(strike.impactAt + L.recoveryMs);
    // Strefa sięga gracza stojącego w zasięgu wyzwolenia.
    expect(L.reach + L.radius).toBeGreaterThan(L.triggerRange);
  });

  it('odstęp między smagnięciami; poza zasięgiem nie smaga', () => {
    const brain = hunting();
    expect(think(brain, L.triggerRange + 1, 0).newAttack).toBeNull();
    const first = think(brain, 50, 0).newAttack!;
    let next: number | null = null;
    for (let now = 0; now < 5000 && next === null; now += FRAME) {
      if (think(brain, 50, now).newAttack) next = now;
    }
    expect(next).toBeGreaterThanOrEqual(first.endsAt + L.cooldownMs);
  });

  it('atak ze wzoru ma pierwszeństwo, gdy już nadszedł jego czas', () => {
    const brain = new BossBrain(QUEEN, createRng(1));
    brain.activate(0);
    const plan = think(brain, 50, QUEEN.openingDelayMs).newAttack!;
    expect(plan.kind).toBe(BossAttackKind.Brood);
  });

  it('balans: uważny gracz zdąży wyjść ze strefy smagnięcia', () => {
    const outside = L.reach + L.radius + 12 - L.triggerRange; // z granicy wyzwolenia poza strefę
    const reaction = 200;
    expect((PLAYER_BASE_STATS.moveSpeed * (L.telegraphMs * QUEEN.enrage.telegraphMultiplier - reaction)) / 1000).toBeGreaterThan(outside);
  });
});

describe('pajączek-kamikaze', () => {
  const S = QUEEN.spiderling;

  it('biegnie do gracza, zapłon przy graczu, wybuch po primeMs', () => {
    const brain = new SpiderlingBrain(S, 0);
    const far = brain.think({ x: 0, y: 0 }, { x: 200, y: 0 }, 100);
    expect(far.phase).toBe(SpiderlingPhase.Chasing);
    expect(far.move.x).toBeCloseTo(1);

    const near = brain.think({ x: 170, y: 0 }, { x: 200, y: 0 }, 500);
    expect(near.primeStarted).toBe(true);
    expect(near.phase).toBe(SpiderlingPhase.Priming);
    expect(near.move).toEqual({ x: 0, y: 0 });

    expect(brain.think({ x: 170, y: 0 }, { x: 400, y: 0 }, 500 + S.primeMs - 1).explode).toBe(false);
    const boom = brain.think({ x: 170, y: 0 }, { x: 400, y: 0 }, 500 + S.primeMs);
    expect(boom.explode).toBe(true);
    expect(brain.think({ x: 170, y: 0 }, { x: 400, y: 0 }, 500 + S.primeMs + 100).explode).toBe(false);
  });

  it('wybucha „po chwili”, nawet gdy nie dobiegł (zapalnik fuseMs od wylęgu)', () => {
    const brain = new SpiderlingBrain(S, 1000);
    expect(brain.think(SELF, { x: 500, y: 0 }, 1000 + S.fuseMs - 1).phase).toBe(SpiderlingPhase.Chasing);
    expect(brain.think(SELF, { x: 500, y: 0 }, 1000 + S.fuseMs).primeStarted).toBe(true);
    expect(brain.explosionAt).toBe(1000 + S.fuseMs + S.primeMs);
  });

  it('ginie od jednego trafienia gracza', () => {
    expect(S.maxHp).toBeLessThanOrEqual(1);
  });

  it('zasięg wybuchu większy niż zasięg zapłonu — gracz musi zareagować', () => {
    expect(S.blastRadius).toBeGreaterThan(S.primeRange);
  });
});

describe('wybór i skalowanie bossa', () => {
  it('Matka Pająków tylko na piętrze 2 (3 — Król, 4 — Pożeracz), 5 — Strażnik Bram, reszta pięter ma Strażnika', () => {
    expect(bossForFloor(2).id).toBe(BossId.SpiderQueen);
    for (const floor of [1, 7]) expect(bossForFloor(floor).id).toBe(BossId.FloorGuardian);
    expect(bossForFloor(1)).toBe(FLOOR_GUARDIAN);
  });

  it('skalowanie piętra obejmuje HP bossa, skok i wybuch pajączków', () => {
    const scaled = scaleBossForFloor(QUEEN, 2, ENEMY_SCALING);
    expect(scaled.maxHp).toBe(scaleForFloor(QUEEN.maxHp, 2, ENEMY_SCALING.hpPerFloor));
    expect(scaled.spiderling.damage).toBe(scaleForFloor(QUEEN.spiderling.damage, 2, ENEMY_SCALING.damagePerFloor));
    expect(scaled.leap.damage).toBe(scaleForFloor(QUEEN.leap.damage, 2, ENEMY_SCALING.damagePerFloor));
    expect(scaled.lash.damage).toBe(scaleForFloor(QUEEN.lash.damage, 2, ENEMY_SCALING.damagePerFloor));
    expect(scaled.lash.status).toEqual(QUEEN.lash.status); // trucizna = Ognista pięść, bez skalowania
    expect(scaled.spiderling.primeMs).toBe(QUEEN.spiderling.primeMs);
    expect('slam' in scaled).toBe(false);
  });
});

describe('sieć Matki Pająków — sprite zgodny z hitboxem plamy', () => {
  it('promień narysowanej sieci w klatkach rozrostu = startRadius … maxRadius (±3 px na obrys i postrzępienie)', () => {
    const sheet = SPRITE_SHEETS.bossWeb;
    const png = readPng(fileURLToPath(new URL(`../../public/${sheet.url}`, import.meta.url)));
    const frames = sheet.animations.grow.frames;
    frames.forEach((column, i) => {
      const expected = QUEEN.web.startRadius + ((QUEEN.web.maxRadius - QUEEN.web.startRadius) * i) / (frames.length - 1);
      const c = sheet.frameWidth / 2;
      let maxDist = 0;
      for (let y = 0; y < sheet.frameHeight; y++) {
        for (let x = 0; x < sheet.frameWidth; x++) {
          if (pixel(png, column * sheet.frameWidth + x, y)[3] === 0) continue;
          maxDist = Math.max(maxDist, Math.hypot(x + 0.5 - c, y + 0.5 - c));
        }
      }
      expect(Math.abs(maxDist - expected)).toBeLessThanOrEqual(3);
    });
  });
});
