import type { ArenaConditionsConfig } from '@/core/arenaConditionTypes';

/**
 * Zmienne warunki na arenach (krok 160, decyzja właściciela 31.10: „wdrażaj wszystko… żeby nie było za dużo
 * kolizji”). Liczby moje, do strojenia w teście właściciela. Kolidujących rekwizytów celowo mało: 2 lustra, 2 słupy.
 */

/** Lustrzana komnata (sprzątaczki): mokre pasy i wiadra (A1), walące się mury z butlami chloru (A3), lustra (A2). */
export const MIRROR_HALL_ARENA: ArenaConditionsConfig = {
  wetFloor: {
    every: { calmMs: 6500, enragedMs: 4500 },
    firstAfterMs: 2500,
    laneTiles: 2,
    sweepMs: 700,
    wetMs: 5000,
    dryMs: 1200,
    maxLanes: 2,
    slip: { durationMs: 450, traction: 2.2 },
    bossSlide: { minSpeed: 120, slideMs: 650, speedMultiplier: 1.2, stunMs: 3500, cooldownMs: 4000 },
    buckets: { count: 2, radius: 12, puddleRadius: 46, puddleMs: 9000, spillOffsetPx: 28 },
  },
  collapse: {
    depthTiles: 2,
    cornerGapTiles: 1,
    entranceClearTiles: 2,
    rippleMs: 70,
    bottles: {
      count: 2,
      radius: 10,
      cloud: {
        radius: 56,
        durationMs: 5000,
        tickMs: 500,
        bossDamage: 12,
        poison: { tickDamage: 2, tickMs: 500, durationMs: 1500 },
      },
    },
  },
  mirrors: {
    count: 2,
    hits: 4,
    minGapTiles: 4,
    shards: { radius: 40, durationMs: 12000, slow: { pct: 0.2, durationMs: 300 } },
    teleport: { touchPx: 6, cooldownMs: 7000 },
  },
};

/** Bociani Ogród (Wiedźma): kruszący się taras nad przepaścią (B3), rosnący żywopłot (B2), gniazda na słupach (B1). */
export const STORK_GARDEN_ARENA: ArenaConditionsConfig = {
  terrace: {
    maxHoleFraction: 0.12,
    crackMs: 1000,
    leapCrackRadiusTiles: 1,
    leapMinRadiusPx: 50,
    clearTiles: 2,
    fall: { damageFraction: 0.15, graceMs: 1200 },
    wind: { every: { calmMs: 9000, enragedMs: 6500 }, firstAfterMs: 5000, telegraphMs: 800, gustMs: 1300, pushPx: 70 },
  },
  hedges: {
    every: { calmMs: 10000, enragedMs: 7000 },
    firstAfterMs: 6000,
    lengthTiles: 3,
    telegraphMs: 1000,
    lifeMs: 8000,
    hitsPerTile: 2,
    maxAlive: 2,
    clearOfBodiesTiles: 1,
  },
  nestPillars: { count: 2, nestHits: 5, baseLanes: 1 },
};
