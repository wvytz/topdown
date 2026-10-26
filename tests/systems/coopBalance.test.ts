import { describe, expect, it } from 'vitest';
import { COOP_CONFIG } from '@/config/coopConfig';
import { getEncounterConfigForFloor } from '@/config/combatConfig';
import { SOLO_BALANCE, withExtraEnemies, withHpMultiplier } from '@/systems/CoopBalance';

describe('balans co-opu (etap C6)', () => {
  it('solo nic nie zmienia', () => {
    const enemy = { maxHp: 40, name: 'x' };
    expect(withHpMultiplier(enemy, SOLO_BALANCE.enemyHpMultiplier)).toBe(enemy);
    const encounters = getEncounterConfigForFloor(3);
    expect(withExtraEnemies(encounters, SOLO_BALANCE.extraEnemiesPerRoom)).toBe(encounters);
  });

  it('co-op: więcej HP wrogów i bossa, jeden wróg więcej na pokój (decyzja właściciela)', () => {
    const { balance } = COOP_CONFIG;
    expect(balance.enemyHpMultiplier).toBeGreaterThan(1);
    expect(balance.bossHpMultiplier).toBeGreaterThan(1);
    expect(withHpMultiplier({ maxHp: 40 }, 1.4).maxHp).toBe(56);
    expect(withExtraEnemies(getEncounterConfigForFloor(1), balance.extraEnemiesPerRoom).enemiesPerRoom).toEqual({ min: 2, max: 3 });
  });

  it('HP co najmniej 1', () => {
    expect(withHpMultiplier({ maxHp: 1 }, 0.1).maxHp).toBe(1);
  });
});
