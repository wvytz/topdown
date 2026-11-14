import { describe, expect, it } from 'vitest';
import { COMBAT_WEIGHT_CONFIG } from '@/config/combatWeightConfig';
import { CombatScale, dropStreakTier, scaledDamage, streakTier, weightsEnabled } from '@/systems/CombatScale';

const { streak, cracks } = COMBAT_WEIGHT_CONFIG;
const make = (enabled = true): CombatScale => new CombatScale(streak, cracks, enabled);

/** `n` trafionych ataków co 100 ms od `from`. */
function landHits(scale: CombatScale, n: number, from = 0): number {
  let t = from;
  for (let i = 0; i < n; i++) scale.strike(true, (t += 100));
  return t;
}

describe('Szala — progi Passy', () => {
  it('liczy progi i dzieli trafienia na poprzedni próg przy spadku', () => {
    expect(streakTier(3, [4, 8, 12])).toBe(0);
    expect(streakTier(8, [4, 8, 12])).toBe(2);
    expect(streakTier(30, [4, 8, 12])).toBe(3);
    expect(dropStreakTier(13, [4, 8, 12])).toBe(8);
    expect(dropStreakTier(9, [4, 8, 12])).toBe(4);
    expect(dropStreakTier(5, [4, 8, 12])).toBe(0);
    expect(dropStreakTier(3, [4, 8, 12])).toBe(0);
  });

  it('trafienia budują Passę i bonus obrażeń; III to najwyższy bonus', () => {
    const scale = make();
    landHits(scale, 4);
    expect(scale.tier).toBe(1);
    expect(scale.outgoingMultiplier).toBeCloseTo(1 + streak.damageBonus[0]!);
    landHits(scale, 20, 1000);
    expect(scale.tier).toBe(3);
    expect(scale.outgoingMultiplier).toBeCloseTo(1 + streak.damageBonus[2]!);
  });

  it('pudło zbija Passę o jeden próg', () => {
    const scale = make();
    landHits(scale, 12);
    scale.strike(false, 1300);
    expect(scale.tier).toBe(2);
    scale.strike(false, 1400);
    expect(scale.tier).toBe(1);
  });

  it('przerwa bez trafienia zbija próg co `decayMs`', () => {
    const scale = make();
    const t = landHits(scale, 12);
    scale.update(t + streak.decayMs - 1);
    expect(scale.tier).toBe(3);
    scale.update(t + streak.decayMs);
    expect(scale.tier).toBe(2);
    scale.update(t + 2 * streak.decayMs);
    expect(scale.tier).toBe(1);
  });
});

describe('Szala — pęknięcia', () => {
  it('przyjęty cios zeruje Passę i dodaje pęknięcie, najwyżej III', () => {
    const scale = make();
    landHits(scale, 9);
    for (let i = 0; i < 5; i++) scale.hurt(2000 + i * 100);
    expect(scale.streak).toBe(0);
    expect(scale.cracks).toBe(cracks.max);
    expect(scale.isBroken).toBe(true);
    expect(scale.incomingMultiplier).toBeCloseTo(1 + cracks.max * cracks.damageTakenPerCrack);
  });

  it('trafienia najpierw zdejmują pęknięcia, potem budują Passę', () => {
    const scale = make();
    scale.hurt(0);
    scale.hurt(10);
    landHits(scale, cracks.hitsToMend, 100);
    expect(scale.cracks).toBe(1);
    expect(scale.streak).toBe(0);
    landHits(scale, cracks.hitsToMend + 1, 1000);
    expect(scale.cracks).toBe(0);
    expect(scale.streak).toBe(1);
  });

  it('spokój bez ciosów zdejmuje pęknięcie co `calmMendMs`', () => {
    const scale = make();
    scale.hurt(0);
    scale.hurt(0);
    scale.update(cracks.calmMendMs - 1);
    expect(scale.cracks).toBe(2);
    scale.update(cracks.calmMendMs);
    expect(scale.cracks).toBe(1);
  });
});

describe('Szala — ataki z pocisków', () => {
  it('salwa liczy się raz, choćby trafiły wszystkie strzały', () => {
    const scale = make();
    const id = scale.begin(3);
    scale.landPart(id, 100);
    scale.landPart(id, 110);
    scale.landPart(id, 120);
    for (let i = 0; i < 3; i++) scale.endPart(id);
    expect(scale.streak).toBe(1);
  });

  it('pudło dopiero, gdy żadna część nie trafiła i wszystkie skończyły lot', () => {
    const scale = make();
    landHits(scale, 8);
    const id = scale.begin(2);
    scale.endPart(id);
    expect(scale.tier).toBe(2);
    scale.endPart(id);
    expect(scale.tier).toBe(1);
  });
});

describe('Szala — wyłącznik', () => {
  it('wyłączona niczego nie liczy, a mnożniki to 1', () => {
    const scale = make(false);
    landHits(scale, 20);
    scale.hurt(5000);
    expect(scale.snapshot()).toEqual({ streak: 0, tier: 0, cracks: 0 });
    expect(scale.outgoingMultiplier).toBe(1);
    expect(scale.incomingMultiplier).toBe(1);
    expect(scale.begin(2)).toBe(0);
  });

  it('?wagi=0|1 nadpisuje config', () => {
    expect(weightsEnabled('?wagi=0', true)).toBe(false);
    expect(weightsEnabled('?hero=archer&wagi=1', false)).toBe(true);
    expect(weightsEnabled('', true)).toBe(true);
  });

  it('obrażenia po mnożniku zaokrąglone, co najmniej 1', () => {
    expect(scaledDamage(20, 1.3)).toBe(26);
    expect(scaledDamage(1, 0.2)).toBe(1);
    expect(scaledDamage(7, 1)).toBe(7);
  });
});
