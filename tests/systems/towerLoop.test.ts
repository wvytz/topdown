import { describe, expect, it } from 'vitest';
import { BiomeId, biomeForFloor } from '@/config/biomeConfig';
import { bossForFloor } from '@/config/bossConfig';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { BossId } from '@/core/bossTypes';
import { eliteAffixCount, floorInLoop, floorLabel, toRoman, towerLoop } from '@/systems/TowerLoop';

/** Długość kręgu z konfiguracji (krok 124: 9 pięter) — testy nie zależą od liczby biomów. */
const L = TOWER_CONFIG.floorsPerLoop;

describe('pętla wieży (krok 43)', () => {
  it('krąg i piętro w kręgu', () => {
    const floors = [1, L, L + 1, 2 * L, 2 * L + 1];
    expect(floors.map((f) => towerLoop(f, TOWER_CONFIG))).toEqual([0, 0, 1, 1, 2]);
    expect(floors.map((f) => floorInLoop(f, TOWER_CONFIG))).toEqual([1, L, 1, L, 1]);
  });

  it('po ostatnim piętrze kręgu biomy i bossowie wracają od początku', () => {
    for (let floor = 1; floor <= L; floor++) {
      expect(biomeForFloor(floor + L).id).toBe(biomeForFloor(floor).id);
      expect(bossForFloor(floor + 2 * L).id).toBe(bossForFloor(floor).id);
    }
    expect(biomeForFloor(L + 2).id).toBe(BiomeId.FungalGrove);
    expect(bossForFloor(L + 4).id).toBe(BossId.AbyssExecutioner);
    expect(bossForFloor(L + 5).id).toBe(BossId.SmokeBaron);
  });

  it('elity: o cechę więcej w każdym kręgu, z limitem', () => {
    expect(eliteAffixCount(L, TOWER_CONFIG)).toBe(1);
    expect(eliteAffixCount(L + 1, TOWER_CONFIG)).toBe(2);
    expect(eliteAffixCount(2 * L + 1, TOWER_CONFIG)).toBe(3);
    expect(eliteAffixCount(60, TOWER_CONFIG)).toBe(TOWER_CONFIG.eliteMaxAffixes);
  });

  it('napis piętra z kręgiem od drugiego kręgu', () => {
    expect(floorLabel(L, TOWER_CONFIG)).toBe(`Piętro ${L}`);
    expect(floorLabel(L + 1, TOWER_CONFIG)).toBe(`Piętro ${L + 1} · Krąg II`);
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(14)).toBe('XIV');
  });
});

describe('koniec runu po 1. kręgu (krok 169)', () => {
  it('schody piętra 7 kończą wspinaczkę, wcześniejsze — nie; areny bossów — nigdy', async () => {
    const { runEndsAfterFloor } = await import('@/systems/TowerLoop');
    const { TOWER_CONFIG } = await import('@/config/towerConfig');
    for (let floor = 1; floor < TOWER_CONFIG.floorsPerLoop; floor++) expect(runEndsAfterFloor(floor, false, TOWER_CONFIG)).toBe(false);
    expect(runEndsAfterFloor(TOWER_CONFIG.floorsPerLoop, false, TOWER_CONFIG)).toBe(true);
    expect(runEndsAfterFloor(9, false, TOWER_CONFIG)).toBe(true);
    expect(runEndsAfterFloor(TOWER_CONFIG.floorsPerLoop, true, TOWER_CONFIG)).toBe(false);
  });
});
