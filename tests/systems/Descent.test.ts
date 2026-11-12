import { describe, expect, it } from 'vitest';
import { DESCENT_CONFIG, DESCENT_ROUTE_SALT } from '@/config/descentConfig';
import { EmberPurse, descentDepth, descentRoute, nextDescentFloor, withUnderworldRule } from '@/systems/Descent';
import { NO_FLOOR_EFFECTS } from '@/systems/FloorModifiers';

describe('trasa Zejścia', () => {
  it('ma zadaną długość, zaczyna od pierwszego odbicia, kończy na ostatnim i rośnie', () => {
    for (let seed = 0; seed < 200; seed++) {
      const route = descentRoute(seed, DESCENT_CONFIG, DESCENT_ROUTE_SALT);
      expect(route).toHaveLength(DESCENT_CONFIG.floors);
      expect(route[0]).toBe(DESCENT_CONFIG.firstFloor);
      expect(route[route.length - 1]).toBe(DESCENT_CONFIG.lastFloor);
      expect([...route].sort((a, b) => a - b)).toEqual(route);
      expect(new Set(route).size).toBe(route.length);
    }
  });

  it('jest deterministyczna i różni się między seedami', () => {
    expect(descentRoute(7, DESCENT_CONFIG, DESCENT_ROUTE_SALT)).toEqual(descentRoute(7, DESCENT_CONFIG, DESCENT_ROUTE_SALT));
    const variants = new Set<string>();
    for (let seed = 0; seed < 100; seed++) variants.add(descentRoute(seed, DESCENT_CONFIG, DESCENT_ROUTE_SALT).join(','));
    // 5 środkowych odbić, jedno pominięte — każde z pięciu powinno się zdarzyć.
    expect(variants.size).toBe(5);
  });

  it('podaje głębię i następne piętro', () => {
    const route = [1, 2, 4, 5, 6, 7];
    expect(descentDepth(route, 1)).toBe(1);
    expect(descentDepth(route, 4)).toBe(3);
    expect(descentDepth(route, 3)).toBe(0);
    expect(nextDescentFloor(route, 2)).toBe(4);
    expect(nextDescentFloor(route, 7)).toBeNull();
    expect(nextDescentFloor(route, 3)).toBeNull();
  });
});

describe('reguła zaświatów', () => {
  it('mnoży mnożniki piętra i zostawia promień widzenia', () => {
    const base = { ...NO_FLOOR_EFFECTS, enemySpeedMultiplier: 1.2, visionRadius: 112 };
    const out = withUnderworldRule(base, { enemySpeedMultiplier: 1.1, enemyDamageMultiplier: 1.1 });
    expect(out.enemySpeedMultiplier).toBeCloseTo(1.32);
    expect(out.enemyDamageMultiplier).toBeCloseTo(1.1);
    expect(out.enemyHpMultiplier).toBe(1);
    expect(out.visionRadius).toBe(112);
  });
});

describe('sakiewka Żaru', () => {
  it('przy śmierci oddaje bezpieczny Żar i połowę luźnego', () => {
    const purse = new EmberPurse(10);
    purse.add(7);
    expect(purse.payout(false, 0.5)).toBe(13);
    expect(purse.payout(true, 0.5)).toBe(17);
  });

  it('boss zabezpiecza luźny Żar', () => {
    const purse = new EmberPurse();
    purse.add(5);
    purse.add(25);
    expect(purse.secure()).toBe(30);
    expect(purse.loose).toBe(0);
    purse.add(3);
    expect(purse.payout(false, 0.5)).toBe(31);
  });

  it('ignoruje ujemne i ułamkowe wartości', () => {
    const purse = new EmberPurse(-4);
    purse.add(-3);
    purse.add(2.9);
    expect(purse.secured).toBe(0);
    expect(purse.loose).toBe(2);
  });
});
