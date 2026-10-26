import { describe, expect, it } from 'vitest';
import { planBossAttack } from '@/ai/bossAttacks';
import { BossAttackKind } from '@/core/bossTypes';
import { createRng } from '@/core/random';
import { FLOOR_GUARDIAN as BOSS } from '@/config/bossConfig';

/** Plucie Strażnika (krok 111): pociski mają losowy czas lotu i lekkie spowolnienie od trafienia. */
const SELF = { x: 400, y: 300 };
const FAR = { x: 900, y: 300 };

function novaPlan(seed: number) {
  return planBossAttack({ kind: BossAttackKind.Nova, definition: BOSS, self: SELF, target: FAR, now: 0, enraged: false, rng: createRng(seed) });
}

describe('plucie Strażnika (Nova)', () => {
  it('każdy pocisk ma czas lotu z przedziału min–max i nie wszystkie są równe', () => {
    const nova = BOSS.nova!;
    const lifetimes = novaPlan(7).bursts.flatMap((burst) => burst.lifetimesMs);
    expect(lifetimes).toHaveLength(nova.projectileCount * nova.waves);
    for (const ms of lifetimes) {
      expect(ms).toBeGreaterThanOrEqual(nova.projectileMinLifetimeMs!);
      expect(ms).toBeLessThanOrEqual(nova.projectileLifetimeMs);
    }
    expect(new Set(lifetimes).size).toBeGreaterThan(1);
  });

  it('część pocisków spada przed ścianą, czyli krócej niż maksymalny czas', () => {
    const lifetimes = novaPlan(11).bursts.flatMap((burst) => burst.lifetimesMs);
    expect(lifetimes.some((ms) => ms < BOSS.nova!.projectileLifetimeMs)).toBe(true);
  });

  it('losowość jest deterministyczna dla tego samego ziarna', () => {
    expect(novaPlan(3).bursts.map((b) => b.lifetimesMs)).toEqual(novaPlan(3).bursts.map((b) => b.lifetimesMs));
  });

  it('pociski niosą lekkie spowolnienie', () => {
    const burst = novaPlan(5).bursts[0]!;
    expect(burst.status?.slow).toEqual({ pct: 0.1, durationMs: 700 });
  });
});
