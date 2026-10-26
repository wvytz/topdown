import type { IntRange } from '@/core/dungeonTypes';

/**
 * Balans co-opu (etap C6, decyzja właściciela): w co-opie wrogowie i bossowie mają więcej HP, a w pokoju stoi
 * jeden wróg więcej. Gra solo zostaje bez zmian (mnożnik 1, bez dodatkowych wrogów). Czysta logika.
 */
export interface CoopBalanceConfig {
  readonly enemyHpMultiplier: number;
  readonly bossHpMultiplier: number;
  readonly extraEnemiesPerRoom: number;
}

export const SOLO_BALANCE: CoopBalanceConfig = { enemyHpMultiplier: 1, bossHpMultiplier: 1, extraEnemiesPerRoom: 0 };

/** Definicja z HP pomnożonym przez `multiplier` (zaokrąglone, co najmniej 1); mnożnik 1 — ta sama definicja. */
export function withHpMultiplier<T extends { readonly maxHp: number }>(definition: T, multiplier: number): T {
  if (multiplier === 1) return definition;
  return { ...definition, maxHp: Math.max(1, Math.round(definition.maxHp * multiplier)) };
}

/** Wrogowie na pokój z dodatkiem co-opu. */
export function withExtraEnemies<T extends { readonly enemiesPerRoom: IntRange }>(config: T, extra: number): T {
  if (extra === 0) return config;
  return { ...config, enemiesPerRoom: { min: config.enemiesPerRoom.min + extra, max: config.enemiesPerRoom.max + extra } };
}
