import { describe, expect, it } from 'vitest';
import { arrivalWounds, duetForFloor, hostArrivalAfterOpener, shouldPartnerArrive } from '@/systems/BossDuet';
import { CLEANER_BLONDE, CLEANER_DARK, BOSS_DUETS, bossById, bossForFloor } from '@/config/bossConfig';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { BOSS_SCALING } from '@/config/combatConfig';
import { scaleForFloor } from '@/systems/CombatMath';

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

describe('sprzątaczki we wspinaczce (krok 126, od kroku 154 jedno piętro)', () => {
  it('na piętrze brunetki (w każdym kręgu) z windy wraca blondynka', () => {
    const loop = TOWER_CONFIG.floorsPerLoop;
    for (const floor of [6, 6 + loop]) {
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

  it('krok 154: walkę otwiera blondynka i ucieka przy 2/3 HP, potem z windy wychodzi brunetka z pełnym HP', () => {
    const duet = duetForFloor(6, BOSS_DUETS, TOWER_CONFIG)!;
    expect(duet.opener?.boss).toBe(CLEANER_BLONDE.id);
    expect(duet.opener!.escapeHpRatio).toBeCloseTo(2 / 3);
    const hostArrival = hostArrivalAfterOpener(duet.opener!);
    expect(arrivalWounds(CLEANER_DARK.maxHp, hostArrival)).toBe(0);
    // Brunetka nie czeka na próg HP — wchodzi dopiero, gdy blondynka odjedzie (pokonana = odjechała).
    expect(shouldPartnerArrive(host(100, { fighting: false }), hostArrival)).toBe(false);
    expect(shouldPartnerArrive(host(100, { fighting: false, defeated: true }), hostArrival)).toBe(true);
    expect(bossById(CLEANER_BLONDE.id)).toBe(CLEANER_BLONDE);
  });

  it('krok 154: blondynka nie ma już własnego piętra, a trzy fazy nie przerastają Wiedźmy o więcej niż 1/3', () => {
    for (let floor = 1; floor <= TOWER_CONFIG.floorsPerLoop; floor++) expect(bossForFloor(floor).id).not.toBe(CLEANER_BLONDE.id);
    const duet = duetForFloor(6, BOSS_DUETS, TOWER_CONFIG)!;
    const at6 = (hp: number) => scaleForFloor(hp, 6, BOSS_SCALING.hpPerFloor);
    const pool =
      at6(CLEANER_BLONDE.maxHp) * (1 - duet.opener!.escapeHpRatio) + at6(CLEANER_DARK.maxHp) + at6(CLEANER_BLONDE.maxHp) * duet.arrival!.partnerHpRatio;
    const witch = scaleForFloor(bossForFloor(7).maxHp, 7, BOSS_SCALING.hpPerFloor);
    expect(pool).toBeLessThan((witch * 4) / 3);
  });
});
