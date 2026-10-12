import type { PlayerCombatConfig, WeaponEffects } from '@/core/combatTypes';
import type { ItemDefinition, ItemEffectsConfig, ItemId, StatLimits, StatModifiers } from '@/core/lootTypes';
import type { PlayerStats } from '@/core/types';
import { computeWeaponEffects } from '@/systems/WeaponEffects';

/** Finalne statystyki gracza po zastosowaniu przedmiotów. */
export interface PlayerLoadout {
  readonly stats: PlayerStats;
  readonly combat: PlayerCombatConfig;
  /** Efekty broni z przedmiotów z efektem (przebicie, podpalenie, ogłuszenie…). */
  readonly effects: WeaponEffects;
}

const NO_MODIFIERS: StatModifiers = {
  maxHp: 0,
  meleeDamage: 0,
  moveSpeedPct: 0,
  attackCooldownPct: 0,
  dashCooldownPct: 0,
  rangedCharges: 0,
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
      rangedCharges: acc.rangedCharges + (mods.rangedCharges ?? 0),
    };
  }, NO_MODIFIERS);
}

/** Bazowe statystyki + przedmioty → finalne statystyki i efekty, z ograniczeniami (limity). */
export function computeLoadout(
  baseStats: PlayerStats,
  baseCombat: PlayerCombatConfig,
  itemIds: readonly ItemId[],
  definitions: Readonly<Record<ItemId, ItemDefinition>>,
  limits: StatLimits,
  effectsConfig: ItemEffectsConfig,
): PlayerLoadout {
  const mods = sumModifiers(itemIds, definitions);
  const cooldownMultiplier = (pct: number): number => Math.max(limits.minCooldownMultiplier, 1 + pct);
  const speedMultiplier = Math.min(limits.maxMoveSpeedMultiplier, Math.max(0.1, 1 + mods.moveSpeedPct));
  const maxCharges = Math.min(
    Math.max(limits.maxRangedCharges, baseCombat.ranged.maxCharges),
    baseCombat.ranged.maxCharges + mods.rangedCharges,
  );

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
      ranged: { ...baseCombat.ranged, maxCharges },
    },
    effects: computeWeaponEffects(itemIds, effectsConfig),
  };
}
