import type { PlayerCombatConfig } from '@/core/combatTypes';
import type { ItemDefinition, ItemId, StatLimits, StatModifiers } from '@/core/lootTypes';
import type { PlayerStats } from '@/core/types';

/** Finalne statystyki gracza po zastosowaniu przedmiotów. */
export interface PlayerLoadout {
  readonly stats: PlayerStats;
  readonly combat: PlayerCombatConfig;
}

const NO_MODIFIERS: StatModifiers = {
  maxHp: 0,
  meleeDamage: 0,
  moveSpeedPct: 0,
  attackCooldownPct: 0,
  dashCooldownPct: 0,
};

/** Sumuje modyfikatory wszystkich posiadanych przedmiotów (przedmioty się kumulują). */
export function sumModifiers(
  itemIds: readonly ItemId[],
  definitions: Readonly<Record<ItemId, ItemDefinition>>,
): StatModifiers {
  return itemIds.reduce<StatModifiers>((acc, id) => {
    const mods = definitions[id].modifiers;
    return {
      maxHp: acc.maxHp + (mods.maxHp ?? 0),
      meleeDamage: acc.meleeDamage + (mods.meleeDamage ?? 0),
      moveSpeedPct: acc.moveSpeedPct + (mods.moveSpeedPct ?? 0),
      attackCooldownPct: acc.attackCooldownPct + (mods.attackCooldownPct ?? 0),
      dashCooldownPct: acc.dashCooldownPct + (mods.dashCooldownPct ?? 0),
    };
  }, NO_MODIFIERS);
}

/** Bazowe statystyki + przedmioty → finalne statystyki, z ograniczeniami (limity). */
export function computeLoadout(
  baseStats: PlayerStats,
  baseCombat: PlayerCombatConfig,
  itemIds: readonly ItemId[],
  definitions: Readonly<Record<ItemId, ItemDefinition>>,
  limits: StatLimits,
): PlayerLoadout {
  const mods = sumModifiers(itemIds, definitions);
  const cooldownMultiplier = (pct: number): number => Math.max(limits.minCooldownMultiplier, 1 + pct);
  const speedMultiplier = Math.min(limits.maxMoveSpeedMultiplier, Math.max(0.1, 1 + mods.moveSpeedPct));

  return {
    stats: {
      ...baseStats,
      maxHp: Math.max(1, baseStats.maxHp + mods.maxHp),
      moveSpeed: Math.round(baseStats.moveSpeed * speedMultiplier),
    },
    combat: {
      ...baseCombat,
      meleeDamage: Math.max(1, baseCombat.meleeDamage + mods.meleeDamage),
      attackCooldownMs: Math.round(baseCombat.attackCooldownMs * cooldownMultiplier(mods.attackCooldownPct)),
      dash: {
        ...baseCombat.dash,
        cooldownMs: Math.round(baseCombat.dash.cooldownMs * cooldownMultiplier(mods.dashCooldownPct)),
      },
    },
  };
}
