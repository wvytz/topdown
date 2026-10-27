import { describe, expect, it } from 'vitest';
import { arrivalWounds, duetForFloor, shouldPartnerArrive } from '@/systems/BossDuet';
import { CLEANER_BLONDE, CLEANER_DARK, BOSS_DUETS, bossById, bossForFloor } from '@/config/bossConfig';
import { TOWER_CONFIG } from '@/config/towerConfig';

const ARRIVAL = { hostHpRatio: 0.5, partnerHpRatio: 1 / 3, enterMs: 700 };
const host = (hp: number, over: Partial<{ fighting: boolean; defeated: boolean }> = {}) => ({
  hp,
  maxHp: 100,
  fighting: true,
  defeated: false,
  ...over,
});

describe('wejście partnera duetu (krok 126)', () => {
  it('partner wchodzi, gdy gospodarz spadnie do progu HP', () => {
    expect(shouldPartnerArrive(host(51), ARRIVAL)).toBe(false);
    expect(shouldPartnerArrive(host(50), ARRIVAL)).toBe(true);
  });

  it('przed walką nie wchodzi, a po śmierci gospodarza wchodzi zawsze', () => {
    expect(shouldPartnerArrive(host(10, { fighting: false }), ARRIVAL)).toBe(false);
    expect(shouldPartnerArrive(host(0, { fighting: false, defeated: true }), ARRIVAL)).toBe(true);
  });

  it('partner przynosi rany: zostaje mu 1/3 HP, co najmniej 1', () => {
    expect(arrivalWounds(600, ARRIVAL)).toBe(400);
    expect(arrivalWounds(1, ARRIVAL)).toBe(0);
  });
});

describe('sprzątaczki we wspinaczce (krok 126)', () => {
  it('na piętrze brunetki (w każdym kręgu) z windy wraca blondynka', () => {
    const loop = TOWER_CONFIG.floorsPerLoop;
    for (const floor of [8, 8 + loop]) {
      const duet = duetForFloor(floor, BOSS_DUETS, TOWER_CONFIG);
      expect(duet?.arrival).toBeDefined();
      expect(bossForFloor(floor).id).toBe(CLEANER_DARK.id);
      expect(duet!.partner).toBe(CLEANER_BLONDE.id);
    }
  });

  it('wraca z tym HP, z którym uciekła', () => {
    const duet = BOSS_DUETS.find((d) => d.partner === CLEANER_BLONDE.id)!;
    expect(duet.arrival!.partnerHpRatio).toBeCloseTo(CLEANER_BLONDE.escape.hpRatio);
  });

  it('na piętrze blondynki duetu nie ma', () => {
    expect(duetForFloor(7, BOSS_DUETS, TOWER_CONFIG)).toBeNull();
    expect(bossById(CLEANER_BLONDE.id)).toBe(CLEANER_BLONDE);
  });
});
