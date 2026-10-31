import type { PlayerCombatConfig, WeaponEffects } from '@/core/combatTypes';
import type { HeroDefinition, HeroKit } from '@/core/heroTypes';
import type { ItemDefinition, ItemEffectsConfig, ItemId, StatLimits, StatModifiers } from '@/core/lootTypes';
import type { PlayerStats } from '@/core/types';
import { applyArcheryModifiers } from '@/systems/Archery';
import { applySorceryModifiers } from '@/systems/Sorcery';
import { attackCooldownMultiplier } from '@/systems/StatScaling';
import { computeWeaponEffects } from '@/systems/WeaponEffects';
import { capItemCopies, countItems, isEvolved } from '@/systems/ItemEvolution';
import { ItemId as ItemIds } from '@/core/lootTypes';

/** Finalne statystyki gracza po zastosowaniu przedmiotów. */
export interface PlayerLoadout {
  readonly stats: PlayerStats;
  readonly combat: PlayerCombatConfig;
  /** Efekty broni z przedmiotów z efektem (przebicie, podpalenie, ogłuszenie…). */
  readonly effects: WeaponEffects;
  /** Broń bohatera po przedmiotach: wręcz i strzał, magia Czarodziejki albo łuk. */
  readonly kit: HeroKit;
}

const NO_MODIFIERS: StatModifiers = {
  maxHp: 0,
  meleeDamage: 0,
  moveSpeedPct: 0,
  attackSpeedPct: 0,
  dashCooldownPct: 0,
  rangedCharges: 0,
};

const MELEE_KIT: HeroKit = { kind: 'melee' };

/** Przedmioty w broni bohatera: magia i łuk biorą to, co u barbarzyńcy daje cios. */
function applyKitModifiers(kit: HeroKit, mods: StatModifiers, limits: StatLimits): HeroKit {
  switch (kit.kind) {
    case 'melee':
      return kit;
    case 'sorcery':
      return { kind: 'sorcery', sorcery: applySorceryModifiers(kit.sorcery, mods, limits) };
    case 'archery':
      return { kind: 'archery', archery: applyArcheryModifiers(kit.archery, mods, limits) };
  }
}

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
      attackSpeedPct: acc.attackSpeedPct + (mods.attackSpeedPct ?? 0),
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
  baseKit: HeroKit = MELEE_KIT,
  /** Krok 150, Rozpęd: chwilowe tempo ataku ponad przedmioty (w tym samym limicie). */
  extraAttackSpeedPct = 0,
): PlayerLoadout {
  // Krok 150: kopie ponad limit przedmiotu nic nie dają (karty i kapliczka ich nie proponują).
  const items = capItemCopies(itemIds, effectsConfig.evolution);
  const counts = countItems(items);
  const evolved = (id: ItemId): boolean => isEvolved(counts.get(id) ?? 0, effectsConfig.evolution);
  const summed = sumModifiers(items, definitions);
  // Napompowane serce (krok 150, pomysł właściciela): przemieniająca kopia Serca daje podwójne HP.
  const mods: StatModifiers = {
    ...summed,
    maxHp: summed.maxHp + (evolved(ItemIds.Heart) ? effectsConfig.evolution.heart.bonusMaxHp : 0),
    attackSpeedPct: summed.attackSpeedPct + extraAttackSpeedPct,
  };
  const quiver = effectsConfig.evolution.quiver;
  const bottomless = evolved(ItemIds.Quiver);
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
      attackCooldownMs: Math.round(baseCombat.attackCooldownMs * attackCooldownMultiplier(mods, limits)),
      dash: {
        ...baseCombat.dash,
        cooldownMs: Math.round(baseCombat.dash.cooldownMs * cooldownMultiplier(mods.dashCooldownPct)),
        // Pętla czasu (Klepsydra ×3): 2 ładunki dasha.
        ...(evolved(ItemIds.Hourglass) && { charges: effectsConfig.evolution.hourglass.dashCharges }),
      },
      ranged: {
        ...baseCombat.ranged,
        maxCharges,
        // Kołczan bez dna (×3): ładunki wracają szybciej.
        rechargeMs: bottomless ? Math.round(baseCombat.ranged.rechargeMs * quiver.rechargeMultiplier) : baseCombat.ranged.rechargeMs,
      },
    },
    effects: computeWeaponEffects(items, effectsConfig, baseStats.maxHp),
    kit: bottomlessKit(applyKitModifiers(baseKit, mods, limits), bottomless, quiver),
  };
}

/** Kołczan bez dna u Czarodziejki (+1 kula, szybszy powrót) i łucznika (szersza salwa). */
function bottomlessKit(kit: HeroKit, on: boolean, quiver: ItemEffectsConfig['evolution']['quiver']): HeroKit {
  if (!on) return kit;
  switch (kit.kind) {
    case 'melee':
      return kit;
    case 'sorcery': {
      const { orbs } = kit.sorcery;
      return {
        kind: 'sorcery',
        sorcery: { ...kit.sorcery, orbs: { ...orbs, maxOrbs: orbs.maxOrbs + quiver.extraOrbs, rechargeMs: Math.round(orbs.rechargeMs * quiver.rechargeMultiplier) } },
      };
    }
    case 'archery': {
      const { volley } = kit.archery;
      return { kind: 'archery', archery: { ...kit.archery, volley: { ...volley, arrows: volley.arrows + quiver.extraVolleyArrows } } };
    }
  }
}

/** Loadout wybranego bohatera: jego bazowe statystyki i zestaw + przedmioty. */
export function computeHeroLoadout(
  hero: HeroDefinition,
  itemIds: readonly ItemId[],
  definitions: Readonly<Record<ItemId, ItemDefinition>>,
  limits: StatLimits,
  effectsConfig: ItemEffectsConfig,
  extraAttackSpeedPct = 0,
): PlayerLoadout {
  return computeLoadout(hero.stats, hero.combat, itemIds, definitions, limits, effectsConfig, hero.kit, extraAttackSpeedPct);
}
