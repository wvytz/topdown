import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import { pixel, readPng } from '../helpers/png';
import { BossBrain } from '@/ai/BossBrain';
import { attackLeadTimeMs, isInWebPatch, planBossAttack, webFlightProgress, webPatchRadius } from '@/ai/bossAttacks';
import { SpiderlingBrain, SpiderlingPhase } from '@/ai/SpiderlingBrain';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import { createRng } from '@/core/random';
import { FLOOR_GUARDIAN, SPIDER_QUEEN as QUEEN, bossForFloor, scaleBossForFloor } from '@/config/bossConfig';
import { ENEMY_SCALING } from '@/config/combatConfig';
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

describe('Matka Pająków — wylęg', () => {
  it('pajączki pojawiają się na końcu złożenia, za bossem (po stronie przeciwnej do gracza)', () => {
    const plan = brood(1000);
    expect(plan.spawns).toHaveLength(QUEEN.brood.count);
    expect(plan.strikes).toHaveLength(0);
    expect(plan.bursts).toHaveLength(0);
    for (const spawn of plan.spawns) {
      expect(spawn.at).toBe(1000 + QUEEN.brood.birthMs);
      expect(spawn.position.x).toBeLessThan(0); // gracz na wschodzie → wylęg na zachodzie
      expect(Math.hypot(spawn.position.x, spawn.position.y)).toBeCloseTo(QUEEN.brood.spawnDistance);
    }
    expect(plan.endsAt).toBe(1000 + QUEEN.brood.birthMs + QUEEN.brood.recoveryMs);
    expect(attackLeadTimeMs(plan, 1000)).toBe(QUEEN.brood.birthMs);
  });

  it('wachlarz: skrajne pajączki rozstawione o spreadDeg', () => {
    const [a, b] = brood(0).spawns;
    // Kąt między wektorami (wachlarz „za bossem” leży przy ±π, więc nie odejmujemy atan2).
    const dot = a!.position.x * b!.position.x + a!.position.y * b!.position.y;
    const spread = Math.acos(dot / QUEEN.brood.spawnDistance ** 2);
    expect(spread).toBeCloseTo((QUEEN.brood.spreadDeg * Math.PI) / 180);
  });

  it('wściekłość: o jeden pajączek więcej i krótsze złożenie', () => {
    const plan = brood(0, { enraged: true });
    expect(plan.spawns).toHaveLength(QUEEN.brood.count + 1);
    expect(plan.spawns[0]!.at).toBe(Math.round(QUEEN.brood.birthMs * QUEEN.enrage.telegraphMultiplier));
  });

  it('limit żywych: wylęg dokłada tylko do maxAlive, przy pełnym limicie jest pusty', () => {
    expect(brood(0, { summonsAlive: QUEEN.brood.maxAlive - 1 }).spawns).toHaveLength(1);
    expect(brood(0, { summonsAlive: QUEEN.brood.maxAlive }).spawns).toHaveLength(0);
  });

  it('gracz w miejscu bossa: wylęg i tak ma kierunek', () => {
    for (const spawn of brood(0, { target: SELF }).spawns) {
      expect(Number.isFinite(spawn.position.x) && Number.isFinite(spawn.position.y)).toBe(true);
    }
  });

  it('BossBrain: wylęg na przemian z rzutem siecią, w stałym rytmie; boss trzyma dystans od gracza', () => {
    const brain = new BossBrain(QUEEN, createRng(1));
    brain.activate(0);
    const starts: Array<{ kind: BossAttackKind; at: number }> = [];
    for (let now = 0; now < 16_000; now += FRAME) {
      const decision = brain.think({ self: SELF, target: { x: 100, y: 0 }, now, hpRatio: 1, summonsAlive: 0 });
      if (decision.newAttack) starts.push({ kind: decision.newAttack.kind, at: now });
      if (!decision.newAttack) expect(decision.move).toEqual({ x: 0, y: 0 }); // 100 px < engageDistance
    }
    expect(starts.length).toBeGreaterThanOrEqual(4);
    const length = {
      [BossAttackKind.Brood]: QUEEN.brood.birthMs + QUEEN.brood.recoveryMs,
      [BossAttackKind.Web]: QUEEN.web.telegraphMs + QUEEN.web.flightMs + QUEEN.web.recoveryMs,
    } as Record<BossAttackKind, number>;
    starts.forEach(({ kind }, i) => expect(kind).toBe(i % 2 === 0 ? BossAttackKind.Brood : BossAttackKind.Web));
    for (let i = 1; i < starts.length; i++) {
      const rhythm = length[starts[i - 1]!.kind] + QUEEN.restBetweenAttacksMs;
      expect(starts[i]!.at - starts[i - 1]!.at).toBeGreaterThanOrEqual(rhythm);
      expect(starts[i]!.at - starts[i - 1]!.at).toBeLessThan(rhythm + FRAME);
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
  it('Matka Pająków tylko na piętrze 2, reszta pięter ma Strażnika', () => {
    expect(bossForFloor(2).id).toBe(BossId.SpiderQueen);
    for (const floor of [1, 3, 4, 7]) expect(bossForFloor(floor).id).toBe(BossId.FloorGuardian);
    expect(bossForFloor(1)).toBe(FLOOR_GUARDIAN);
  });

  it('skalowanie piętra obejmuje HP bossa i wybuch pajączków', () => {
    const scaled = scaleBossForFloor(QUEEN, 2, ENEMY_SCALING);
    expect(scaled.maxHp).toBe(scaleForFloor(QUEEN.maxHp, 2, ENEMY_SCALING.hpPerFloor));
    expect(scaled.spiderling.damage).toBe(scaleForFloor(QUEEN.spiderling.damage, 2, ENEMY_SCALING.damagePerFloor));
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
