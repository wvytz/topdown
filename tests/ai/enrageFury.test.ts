import { describe, expect, it } from 'vitest';
import { BossBrain } from '@/ai/BossBrain';
import type { BossAttackPlan, BossDefinition } from '@/core/bossTypes';
import { BossAttackKind } from '@/core/bossTypes';
import { createRng } from '@/core/random';
import { BOSS_BY_FLOOR, FLOOR_GUARDIAN as BOSS, scaleBossForFloor } from '@/config/bossConfig';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { scaleForFloor } from '@/systems/CombatMath';

/** Mocniejsza wściekłość (krok 81): ryk przy wejściu we wściekłość i ataki seriami po dwa. */
const SELF = { x: 0, y: 0 };
const TARGET = { x: 70, y: 0 };
const FRAME = 16;

/** Symulacja: HP spada poniżej progu w `enrageAt`; zwraca rozpoczęte ataki. */
function run(boss: BossDefinition, untilMs: number, enrageAt: number): Array<{ at: number; plan: BossAttackPlan }> {
  const brain = new BossBrain(boss, createRng(1));
  brain.activate(0);
  const out: Array<{ at: number; plan: BossAttackPlan }> = [];
  for (let now = 0; now < untilMs; now += FRAME) {
    const hpRatio = now >= enrageAt ? boss.enrage.hpThreshold - 0.01 : 1;
    const d = brain.think({ self: SELF, target: TARGET, now, hpRatio });
    if (d.newAttack) out.push({ at: now, plan: d.newAttack });
  }
  return out;
}

describe('mocniejsza wściekłość (krok 81)', () => {
  it('ryk raz, zaraz po wejściu we wściekłość (po skończeniu bieżącego ataku); fala wokół bossa', () => {
    const attacks = run(BOSS, 40_000, 5000);
    const roars = attacks.filter((a) => a.plan.kind === BossAttackKind.Roar);
    expect(roars).toHaveLength(1);
    const roar = roars[0]!;
    expect(roar.at).toBeGreaterThanOrEqual(5000);
    const before = attacks.filter((a) => a.at < roar.at).at(-1)!;
    expect(roar.at).toBeLessThan(Math.max(5000, before.plan.endsAt) + 2 * FRAME);
    expect(roar.plan.strikes[0]!.center).toEqual(SELF);
    expect(roar.plan.strikes[0]!.radius).toBe(BOSS.enrage.roar!.radius);
    expect(roar.plan.strikes[0]!.impactAt - roar.at).toBe(BOSS.enrage.roar!.telegraphMs);
  });

  it('bez ryku, gdy walka zaczyna się od wściekłości (np. boss poniżej progu od początku)', () => {
    expect(run(BOSS, 20_000, 0).some((a) => a.plan.kind === BossAttackKind.Roar)).toBe(false);
  });

  it('we wściekłości ataki ze wzoru idą parami: krótka luka w parze, pełna przerwa po parze', () => {
    const fury = run(BOSS, 60_000, 0);
    const { comboGapMs, restMultiplier } = BOSS.enrage;
    const rest = BOSS.restBetweenAttacksMs * restMultiplier;
    for (let i = 1; i < 8; i++) {
      const gap = fury[i]!.at - fury[i - 1]!.plan.endsAt;
      const expected = i % 2 === 1 ? comboGapMs! : rest;
      expect(gap).toBeGreaterThanOrEqual(expected);
      expect(gap).toBeLessThan(expected + FRAME);
    }
  });

  it('spokojny boss bez serii: zawsze pełna przerwa', () => {
    const calm = run(BOSS, 30_000, Infinity);
    for (let i = 1; i < calm.length; i++) {
      expect(calm[i]!.at - calm[i - 1]!.plan.endsAt).toBeGreaterThanOrEqual(BOSS.restBetweenAttacksMs);
    }
  });

  it('każdy boss ma ryk i serie; obrażenia ryku rosną z piętrem', () => {
    for (const boss of [BOSS, ...Object.values(BOSS_BY_FLOOR)]) {
      expect(boss.enrage.roar).toBeDefined();
      expect(boss.enrage.comboLength).toBe(2);
    }
    const scaled = scaleBossForFloor(BOSS, 4, ENEMY_SCALING);
    expect(scaled.enrage.roar!.damage).toBe(scaleForFloor(BOSS.enrage.roar!.damage, 4, ENEMY_SCALING.damagePerFloor));
  });
});
