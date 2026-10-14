import { describe, expect, it } from 'vitest';
import { BossBrain } from '@/ai/BossBrain';
import { attackLeadTimeMs, planBossAttack } from '@/ai/bossAttacks';
import { SpiderlingBrain, SpiderlingPhase } from '@/ai/SpiderlingBrain';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import { createRng } from '@/core/random';
import { FLOOR_GUARDIAN, SPIDER_QUEEN as QUEEN, bossForFloor, scaleBossForFloor } from '@/config/bossConfig';
import { ENEMY_SCALING } from '@/config/combatConfig';
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

  it('BossBrain: boss tylko wylęga, w stałym rytmie, i trzyma dystans od gracza', () => {
    const brain = new BossBrain(QUEEN, createRng(1));
    brain.activate(0);
    const starts: number[] = [];
    for (let now = 0; now < 12_000; now += FRAME) {
      const decision = brain.think({ self: SELF, target: { x: 100, y: 0 }, now, hpRatio: 1, summonsAlive: 0 });
      if (decision.newAttack) {
        expect(decision.newAttack.kind).toBe(BossAttackKind.Brood);
        starts.push(now);
      }
      if (!decision.newAttack) expect(decision.move).toEqual({ x: 0, y: 0 }); // 100 px < engageDistance
    }
    const rhythm = QUEEN.brood.birthMs + QUEEN.brood.recoveryMs + QUEEN.restBetweenAttacksMs;
    expect(starts.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(rhythm);
      expect(starts[i]! - starts[i - 1]!).toBeLessThan(rhythm + FRAME);
    }
  });

  it('nie atakuje Strażnikowymi atakami bez ich definicji (błąd konfiguracji jest głośny)', () => {
    expect(() =>
      planBossAttack({ kind: BossAttackKind.Slam, definition: QUEEN, self: SELF, target: PLAYER_EAST, now: 0, enraged: false, rng: createRng(1) }),
    ).toThrow(/slam/);
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
