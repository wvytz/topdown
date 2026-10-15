import { describe, expect, it } from 'vitest';
import { BiomeId, biomeForFloor } from '@/config/biomeConfig';
import { bossForFloor } from '@/config/bossConfig';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { BossId } from '@/core/bossTypes';
import { eliteAffixCount, floorInLoop, floorLabel, toRoman, towerLoop } from '@/systems/TowerLoop';

describe('pętla wieży (krok 43)', () => {
  it('krąg i piętro w kręgu', () => {
    expect([1, 6, 7, 12, 13].map((f) => towerLoop(f, TOWER_CONFIG))).toEqual([0, 0, 1, 1, 2]);
    expect([1, 6, 7, 12, 13].map((f) => floorInLoop(f, TOWER_CONFIG))).toEqual([1, 6, 1, 6, 1]);
  });

  it('po piętrze 6 biomy i bossowie wracają od początku', () => {
    for (let floor = 1; floor <= 6; floor++) {
      expect(biomeForFloor(floor + 6).id).toBe(biomeForFloor(floor).id);
      expect(bossForFloor(floor + 12).id).toBe(bossForFloor(floor).id);
    }
    expect(biomeForFloor(8).id).toBe(BiomeId.SpiderLair);
    expect(bossForFloor(12).id).toBe(BossId.AbyssExecutioner);
  });

  it('elity: o cechę więcej w każdym kręgu, z limitem', () => {
    expect(eliteAffixCount(6, TOWER_CONFIG)).toBe(1);
    expect(eliteAffixCount(7, TOWER_CONFIG)).toBe(2);
    expect(eliteAffixCount(13, TOWER_CONFIG)).toBe(3);
    expect(eliteAffixCount(60, TOWER_CONFIG)).toBe(TOWER_CONFIG.eliteMaxAffixes);
  });

  it('napis piętra z kręgiem od drugiego kręgu', () => {
    expect(floorLabel(6, TOWER_CONFIG)).toBe('Piętro 6');
    expect(floorLabel(7, TOWER_CONFIG)).toBe('Piętro 7 · Krąg II');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(14)).toBe('XIV');
  });
});
