import type { StatLimits, StatModifiers } from '@/core/lootTypes';

/**
 * Krok 117: mnożnik czasu ataku z tempa ataku. Tempo rośnie liniowo (+12% za Rękawice), więc każda kopia
 * dodaje tyle samo ciosów na sekundę — dawniej odejmowanie procentów czasu dawało coraz większe przyrosty.
 */
export function attackCooldownMultiplier(mods: StatModifiers, limits: StatLimits): number {
  const bonus = Math.min(limits.maxAttackSpeedBonus, Math.max(0, mods.attackSpeedPct));
  return Math.max(limits.minCooldownMultiplier, 1 / (1 + bonus));
}
