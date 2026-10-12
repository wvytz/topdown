import { EnemyType } from '@/core/combatTypes';
import type { ItemDefinition, LootScalingConfig, LootTable, StatLimits } from '@/core/lootTypes';
import { ItemId } from '@/core/lootTypes';
import type { ShrineConfig } from '@/systems/Shrine';

/** Podstawowa pula przedmiotów pasywnych — kumulują się w trakcie runu. */
export const ITEM_DEFINITIONS: Readonly<Record<ItemId, ItemDefinition>> = {
  [ItemId.Blade]: {
    id: ItemId.Blade,
    name: 'Ostrze',
    effect: '+3 obrażeń',
    color: 0xd8dce8,
    weight: 10,
    modifiers: { meleeDamage: 3 },
  },
  [ItemId.Heart]: {
    id: ItemId.Heart,
    name: 'Serce',
    effect: '+20 maks. HP',
    color: 0xff5a7a,
    weight: 10,
    modifiers: { maxHp: 20 },
  },
  [ItemId.Boots]: {
    id: ItemId.Boots,
    name: 'Buty',
    effect: '+10% prędkości',
    color: 0x7fd36b,
    weight: 8,
    modifiers: { moveSpeedPct: 0.1 },
  },
  [ItemId.Gloves]: {
    id: ItemId.Gloves,
    name: 'Rękawice',
    effect: '-12% czasu ataku',
    color: 0xf0a040,
    weight: 5,
    modifiers: { attackCooldownPct: -0.12 },
  },
  [ItemId.Hourglass]: {
    id: ItemId.Hourglass,
    name: 'Klepsydra',
    effect: '-20% odnowienia dasha',
    color: 0x6ec6ff,
    weight: 5,
    modifiers: { dashCooldownPct: -0.2 },
  },
};

export const ITEM_POOL: readonly ItemDefinition[] = Object.values(ITEM_DEFINITIONS);

export const STAT_LIMITS: StatLimits = {
  /** Cooldowny nie spadną poniżej 50% bazowych. */
  minCooldownMultiplier: 0.5,
  /** Prędkość ruchu maks. +60%. */
  maxMoveSpeedMultiplier: 1.6,
};

export const ENEMY_LOOT: Readonly<Record<EnemyType, LootTable>> = {
  [EnemyType.Rusher]: {
    gold: { min: 1, max: 3 },
    goldChance: 0.8,
    healthChance: 0.12,
    healthAmount: 15,
    itemChance: 0.04,
  },
  [EnemyType.Kiter]: {
    gold: { min: 2, max: 4 },
    goldChance: 0.8,
    healthChance: 0.12,
    healthAmount: 15,
    itemChance: 0.05,
  },
};

/** Boss: zawsze złoto, mikstura i przedmiot — nagroda za zamknięcie piętra. */
export const BOSS_LOOT: LootTable = {
  gold: { min: 15, max: 25 },
  goldChance: 1,
  healthChance: 1,
  healthAmount: 30,
  itemChance: 1,
};

export const LOOT_SCALING: LootScalingConfig = {
  goldPerFloor: 0.2,
};

/**
 * Kapliczka: ofiara złota (= wyniku) w zamian za losowy bonus z puli przedmiotów.
 * Piętro 1 daje ~30 złota, więc ofiara to wyraźny, ale nie miażdżący koszt.
 */
export const SHRINE_CONFIG: ShrineConfig = {
  baseCost: 15,
  costPerFloor: 0.3,
  interactRadius: 40,
};

/** Ile wyników trzymamy i ile pokazujemy na podium. */
export const HIGHSCORE_CONFIG = {
  maxEntries: 50,
  podiumSize: 3,
} as const;

export const PICKUP_CONFIG = {
  /** Z tej odległości łupy same lecą do gracza. */
  magnetRadius: 80,
  magnetSpeed: 340,
  /** Odległość zebrania (środek–środek). */
  collectRadius: 18,
  /** Chwila po wypadnięciu, zanim łup da się zebrać — widać „rozsypanie”. */
  collectDelayMs: 300,
  scatterSpeed: 120,
  /** Ile monet maksymalnie wypada z jednej kwoty złota. */
  maxCoinsPerDrop: 5,
} as const;
