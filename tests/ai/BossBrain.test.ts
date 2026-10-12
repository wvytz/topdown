import { describe, expect, it } from 'vitest';
import { BossBrain } from '@/ai/BossBrain';
import { attackLeadTimeMs, isHitByAreaStrike, planBossAttack } from '@/ai/bossAttacks';
import type { BossAttackPlan } from '@/core/bossTypes';
import { BossAttackKind, BossPhase } from '@/core/bossTypes';
import { createRng } from '@/core/random';
import { FLOOR_GUARDIAN as BOSS, scaleBossForFloor } from '@/config/bossConfig';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { scaleForFloor } from '@/systems/CombatMath';

const SELF = { x: 0, y: 0 };
const NEAR = { x: 50, y: 0 };
const FAR = { x: 300, y: 0 };
const FRAME = 16;

/** Symuluje walkę klatka po klatce i zbiera rozpoczęte ataki wraz z czasem startu. */
function collectAttacks(brain: BossBrain, untilMs: number, hpRatio = 1): Array<{ at: number; plan: BossAttackPlan }> {
  const attacks: Array<{ at: number; plan: BossAttackPlan }> = [];
  for (let now = 0; now < untilMs; now += FRAME) {
    const decision = brain.think({ self: SELF, target: NEAR, now, hpRatio });
    if (decision.newAttack) attacks.push({ at: now, plan: decision.newAttack });
  }
  return attacks;
}

describe('BossBrain', () => {
  it('jest uśpiony do aktywacji — nie rusza się i nie atakuje', () => {
    const brain = new BossBrain(BOSS, createRng(1));
    for (let now = 0; now < 10_000; now += 500) {
      const decision = brain.think({ self: SELF, target: NEAR, now, hpRatio: 1 });
      expect(decision.newAttack).toBeNull();
      expect(decision.move).toEqual({ x: 0, y: 0 });
    }
    expect(brain.currentPhase).toBe(BossPhase.Dormant);
  });

  it('po aktywacji podchodzi do gracza przed pierwszym atakiem', () => {
    const brain = new BossBrain(BOSS, createRng(1));
    brain.activate(0);
    const decision = brain.think({ self: SELF, target: FAR, now: 100, hpRatio: 1 });
    expect(decision.move).toEqual({ x: 1, y: 0 });
    expect(decision.newAttack).toBeNull();
  });

  it('wykonuje ataki w sekwencji z konfiguracji, w kółko', () => {
    const brain = new BossBrain(BOSS, createRng(1));
    brain.activate(0);
    const kinds = collectAttacks(brain, 40_000).map((a) => a.plan.kind).slice(0, 6);
    expect(kinds).toEqual([...BOSS.pattern, ...BOSS.pattern]);
  });

  it('pierwszy atak po openingDelay, kolejne po zakończeniu poprzedniego + przerwie', () => {
    const brain = new BossBrain(BOSS, createRng(1));
    brain.activate(0);
    const attacks = collectAttacks(brain, 20_000);
    expect(attacks[0]!.at).toBeGreaterThanOrEqual(BOSS.openingDelayMs);
    for (let i = 1; i < attacks.length; i++) {
      expect(attacks[i]!.at).toBeGreaterThanOrEqual(attacks[i - 1]!.plan.endsAt + BOSS.restBetweenAttacksMs);
    }
  });

  it('ogłuszenie (delay) odsuwa pierwszy atak; uśpionego bossa nie dotyczy', () => {
    const dormant = new BossBrain(BOSS, createRng(1));
    dormant.delay(500);
    dormant.activate(0);
    expect(collectAttacks(dormant, 3000)[0]?.at).toBeLessThan(BOSS.openingDelayMs + FRAME);

    const stunned = new BossBrain(BOSS, createRng(1));
    stunned.activate(0);
    stunned.delay(500);
    const first = collectAttacks(stunned, 3000)[0]?.at ?? Infinity;
    expect(first).toBeGreaterThanOrEqual(BOSS.openingDelayMs + 500);
    expect(first).toBeLessThan(BOSS.openingDelayMs + 500 + FRAME);
  });

  it('stoi w miejscu przez cały czas trwania ataku', () => {
    const brain = new BossBrain(BOSS, createRng(1));
    brain.activate(0);
    let current: BossAttackPlan | null = null;
    for (let now = 0; now < 15_000; now += FRAME) {
      const decision = brain.think({ self: SELF, target: FAR, now, hpRatio: 1 });
      if (decision.newAttack) current = decision.newAttack;
      if (current && now < current.endsAt) expect(decision.move).toEqual({ x: 0, y: 0 });
    }
  });

  it('wściekłość poniżej progu HP skraca przerwy między atakami', () => {
    const calm = new BossBrain(BOSS, createRng(1));
    const enraged = new BossBrain(BOSS, createRng(1));
    calm.activate(0);
    enraged.activate(0);
    const calmCount = collectAttacks(calm, 30_000, 1).length;
    const enragedCount = collectAttacks(enraged, 30_000, BOSS.enrage.hpThreshold - 0.01).length;
    expect(enragedCount).toBeGreaterThan(calmCount);
    expect(enraged.think({ self: SELF, target: NEAR, now: 0, hpRatio: 0.2 }).enraged).toBe(true);
  });
});

describe('planBossAttack', () => {
  const plan = (kind: BossAttackKind, enraged = false, now = 1000): BossAttackPlan =>
    planBossAttack({ kind, definition: BOSS, self: SELF, target: FAR, now, enraged, rng: createRng(3) });

  it('attackLeadTimeMs: czas do pierwszego wystrzału lub wybuchu (pod animację ataku)', () => {
    expect(attackLeadTimeMs(plan(BossAttackKind.Nova), 1000)).toBe(BOSS.nova.telegraphMs);
    expect(attackLeadTimeMs(plan(BossAttackKind.Slam), 1000)).toBe(BOSS.slam.telegraphMs);
    expect(attackLeadTimeMs(plan(BossAttackKind.Barrage), 1000)).toBe(BOSS.barrage.telegraphMs);
    expect(attackLeadTimeMs(plan(BossAttackKind.Nova, true), 1000)).toBe(
      Math.round(BOSS.nova.telegraphMs * BOSS.enrage.telegraphMultiplier),
    );
    expect(attackLeadTimeMs(plan(BossAttackKind.Nova), 99_999)).toBe(0);
    expect(attackLeadTimeMs({ kind: BossAttackKind.Slam, strikes: [], bursts: [], endsAt: 0 }, 0)).toBe(0);
  });

  it('Uderzenie: jedna strefa wokół bossa, uderza po telegrafie', () => {
    const slam = plan(BossAttackKind.Slam);
    expect(slam.strikes).toHaveLength(1);
    expect(slam.strikes[0]!.center).toEqual(SELF);
    expect(slam.strikes[0]!.impactAt).toBe(1000 + BOSS.slam.telegraphMs);
    expect(slam.endsAt).toBe(1000 + BOSS.slam.telegraphMs + BOSS.slam.recoveryMs);
  });

  it('wściekłość skraca telegraf', () => {
    const slam = plan(BossAttackKind.Slam, true);
    expect(slam.strikes[0]!.impactAt).toBe(1000 + Math.round(BOSS.slam.telegraphMs * BOSS.enrage.telegraphMultiplier));
  });

  it('Nova: fale pocisków, przy wściekłości o jedną więcej i obrócone', () => {
    const calm = plan(BossAttackKind.Nova);
    const enraged = plan(BossAttackKind.Nova, true);
    expect(calm.bursts).toHaveLength(BOSS.nova.waves);
    expect(enraged.bursts).toHaveLength(BOSS.nova.waves + 1);
    expect(enraged.bursts[1]!.angleOffset).toBeCloseTo(Math.PI / BOSS.nova.projectileCount);
    expect(enraged.bursts[1]!.fireAt - enraged.bursts[0]!.fireAt).toBe(BOSS.nova.waveIntervalMs);
  });

  it('Ostrzał: pierwsza strefa na graczu, kolejne w zasięgu rozrzutu i wybuchają po kolei', () => {
    const barrage = plan(BossAttackKind.Barrage);
    expect(barrage.strikes).toHaveLength(BOSS.barrage.zoneCount);
    expect(barrage.strikes[0]!.center).toEqual(FAR);
    barrage.strikes.forEach((strike, i) => {
      expect(Math.hypot(strike.center.x - FAR.x, strike.center.y - FAR.y)).toBeLessThanOrEqual(BOSS.barrage.spread + 1e-9);
      if (i > 0) expect(strike.impactAt).toBe(barrage.strikes[i - 1]!.impactAt + BOSS.barrage.intervalMs);
    });
    expect(barrage.endsAt).toBe(barrage.strikes.at(-1)!.impactAt + BOSS.barrage.recoveryMs);
  });

  it('każdy atak kończy się po swoim ostatnim uderzeniu', () => {
    for (const kind of Object.values(BossAttackKind)) {
      for (const enraged of [false, true]) {
        const p = plan(kind, enraged);
        const lastImpact = Math.max(...p.strikes.map((s) => s.impactAt), ...p.bursts.map((b) => b.fireAt));
        expect(p.endsAt).toBeGreaterThan(lastImpact);
      }
    }
  });
});

describe('isHitByAreaStrike', () => {
  const strike = { center: SELF, radius: 100, telegraphStartAt: 0, impactAt: 900, damage: 10, knockback: 0 };

  it('trafia, gdy obrys celu przecina strefę', () => {
    expect(isHitByAreaStrike(strike, { x: 105, y: 0 }, 12)).toBe(true);
    expect(isHitByAreaStrike(strike, { x: 115, y: 0 }, 12)).toBe(false);
  });
});

describe('scaleBossForFloor', () => {
  it('skaluje HP i obrażenia wszystkich ataków', () => {
    const scaled = scaleBossForFloor(BOSS, 3, ENEMY_SCALING);
    expect(scaled.maxHp).toBe(scaleForFloor(BOSS.maxHp, 3, ENEMY_SCALING.hpPerFloor));
    expect(scaled.slam.damage).toBe(scaleForFloor(BOSS.slam.damage, 3, ENEMY_SCALING.damagePerFloor));
    expect(scaled.nova.damage).toBe(scaleForFloor(BOSS.nova.damage, 3, ENEMY_SCALING.damagePerFloor));
    expect(scaled.barrage.damage).toBe(scaleForFloor(BOSS.barrage.damage, 3, ENEMY_SCALING.damagePerFloor));
    expect(scaled.slam.telegraphMs).toBe(BOSS.slam.telegraphMs);
  });

  it('piętro 1 nie zmienia definicji', () => {
    expect(scaleBossForFloor(BOSS, 1, ENEMY_SCALING)).toEqual(BOSS);
  });
});
