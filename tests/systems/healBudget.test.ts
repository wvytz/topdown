import { describe, expect, it } from 'vitest';
import { ItemId } from '@/core/lootTypes';
import { PLAYER_COMBAT } from '@/config/combatConfig';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { ITEM_DEFINITIONS, ITEM_EFFECTS, STAT_LIMITS } from '@/config/lootConfig';
import { computeLoadout } from '@/systems/PlayerLoadout';
import { HealBudget } from '@/systems/HealBudget';

describe('HealBudget (krok 93: sufit leczenia kła)', () => {
  it('pierwsze leczenie bierze z pełnego zapasu na 1 s', () => {
    expect(new HealBudget().take(10, 0, 4)).toBe(4);
  });

  it('pod sufitem leczy w całości', () => {
    const budget = new HealBudget();
    for (let t = 0; t < 10_000; t += 700) expect(budget.take(2, t, 4)).toBe(2);
  });

  it('nad sufitem średnio leczy najwyżej ratePerSec HP/s', () => {
    const budget = new HealBudget();
    let healed = 0;
    for (let t = 0; t <= 20_000; t += 700) healed += budget.take(6, t, 4);
    // 20 s × 4 HP/s + zapas startowy (4 HP).
    expect(healed).toBeLessThanOrEqual(20 * 4 + 4);
    expect(healed).toBeGreaterThan(20 * 4 - 4);
  });

  it('zapas nie rośnie ponad 1 s przy długiej przerwie', () => {
    const budget = new HealBudget();
    budget.take(4, 0, 4);
    expect(budget.take(100, 60_000, 4)).toBe(4);
  });

  it('jedna kopia kła mieści się pod sufitem nawet przy 75 HP', () => {
    const { heal, cooldownMs, maxHpPctPerSec } = ITEM_EFFECTS.vampireFang;
    expect((heal * 1000) / cooldownMs).toBeLessThanOrEqual(75 * maxHpPctPerSec);
  });

  it('krok 117: sufit liczony od bazowego HP — Serca go nie podnoszą', () => {
    const items = [ItemId.VampireFang, ...Array.from({ length: 8 }, () => ItemId.Heart)];
    const geared = computeLoadout(PLAYER_BASE_STATS, PLAYER_COMBAT, items, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);
    expect(geared.stats.maxHp).toBeGreaterThan(PLAYER_BASE_STATS.maxHp);
    expect(geared.effects.meleeHealMaxPerSec).toBeCloseTo(PLAYER_BASE_STATS.maxHp * ITEM_EFFECTS.vampireFang.maxHpPctPerSec);
  });
});
