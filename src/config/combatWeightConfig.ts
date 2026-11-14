import type { CombatWeightConfig } from '@/core/combatWeightTypes';

/**
 * System wag, wersja lekka (krok U11a, decyzja właściciela 14.11.2026, docs/WAGI.md §11):
 * 1) trafiasz, to rośniesz (Passa I–III), pudło zbija próg; 2) dostajesz, to pękasz (Odsłonięcie I–III);
 * 3) czerwony znaczy uciekaj — przy III wróg dostaje okno na atak kary, przed którym ratuje tylko dash.
 * Wartości startowe do strojenia botem (U11b), nie decyzja balansu.
 */
export const COMBAT_WEIGHT_CONFIG: CombatWeightConfig = {
  enabled: true,
  streak: {
    tiers: [4, 8, 12],
    damageBonus: [0.1, 0.2, 0.3],
    decayMs: 2500,
  },
  cracks: {
    max: 3,
    damageTakenPerCrack: 0.12,
    hitsToMend: 2,
    calmMendMs: 5000,
  },
  punish: {
    cooldownMs: 6000,
    piercingShot: {
      minRange: 48,
      maxRange: 300,
      aimMs: 700,
      freezeMs: 250,
      speed: 620,
      range: 420,
      halfWidth: 4,
      damageMultiplier: 2,
      knockback: 260,
    },
    ram: {
      minRange: 40,
      maxRange: 220,
      windupMs: 700,
      speed: 430,
      maxDistance: 280,
      hitRadius: 10,
      damageMultiplier: 1.8,
      knockback: 420,
      wallStunMs: 1400,
      missRecoveryMs: 800,
      hitRecoveryMs: 500,
      wallGraceMs: 60,
    },
  },
  visual: {
    counterFrom: 2,
    counterColors: ['#c8c8c8', '#ffffff', '#ffd34a'],
    counterOffset: { x: 13, y: -20 },
    crackColor: 0xff3b3b,
    crackOutline: 0x2a0606,
    crackAnglesDeg: [-40, 200, 80],
    crackRadius: 11,
    crackLength: 7,
    crackPulseMs: [900, 600, 300],
    punishColor: 0xff2a2a,
    punishCss: '#ff2a2a',
    punishTint: 0xff9a9a,
  },
};

/** Sól strumienia RNG ataku kary (sól + seed piętra) — nagrania wejść odtwarzają się tak samo. */
export const PUNISH_SEED_SALT = 0x3a11;
