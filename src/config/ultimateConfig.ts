import type { UltimateGaugeConfig } from '@/core/heroTypes';

/**
 * Pasek mocy ultimate (krok 98, R): pełny na starcie piętra (i areny), potem rośnie przez 50 s
 * albo szybciej za zabicia (5% za wroga). Ultimate każdego bohatera — w `heroConfig.ts`.
 */
export const ULTIMATE_GAUGE: UltimateGaugeConfig = {
  passivePerSec: 1 / 50,
  perKill: 0.05,
  startCharge: 1,
};
