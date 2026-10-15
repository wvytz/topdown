import type { SecretRoomConfig } from '@/dungeon/SecretRoom';
import { EnemyType } from '@/core/combatTypes';
import type { ItemDefinition, ItemEffectsConfig, LootScalingConfig, LootTable, StatLimits } from '@/core/lootTypes';
import { ItemId, ItemKind } from '@/core/lootTypes';
import type { ShrineConfig } from '@/systems/Shrine';

/** Pula przedmiotów pasywnych (5 bazowych + 7 z efektem) — kumulują się w trakcie runu. */
export const ITEM_DEFINITIONS: Readonly<Record<ItemId, ItemDefinition>> = {
  [ItemId.Blade]: {
    id: ItemId.Blade,
    kind: ItemKind.Stat,
    name: 'Ostrze',
    effect: '+3 obrażeń',
    color: 0xd8dce8,
    weight: 10,
    modifiers: { meleeDamage: 3 },
  },
  [ItemId.Heart]: {
    id: ItemId.Heart,
    kind: ItemKind.Stat,
    name: 'Serce',
    effect: '+20 maks. HP',
    color: 0xff5a7a,
    weight: 10,
    modifiers: { maxHp: 20 },
  },
  [ItemId.Boots]: {
    id: ItemId.Boots,
    kind: ItemKind.Stat,
    name: 'Buty',
    effect: '+10% prędkości',
    color: 0x7fd36b,
    weight: 8,
    modifiers: { moveSpeedPct: 0.1 },
  },
  [ItemId.Gloves]: {
    id: ItemId.Gloves,
    kind: ItemKind.Stat,
    name: 'Rękawice',
    effect: '-12% czasu ataku',
    color: 0xf0a040,
    weight: 5,
    modifiers: { attackCooldownPct: -0.12 },
  },
  [ItemId.Hourglass]: {
    id: ItemId.Hourglass,
    kind: ItemKind.Stat,
    name: 'Klepsydra',
    effect: '-20% odnowienia dasha',
    color: 0x6ec6ff,
    weight: 5,
    modifiers: { dashCooldownPct: -0.2 },
  },

  // Przedmioty z efektem: rzadsze (mniejsza waga), kolejne kopie wzmacniają efekt (ITEM_EFFECTS).
  [ItemId.Shuriken]: {
    id: ItemId.Shuriken,
    kind: ItemKind.Effect,
    name: 'Szuriken',
    effect: 'strzał przebija wroga',
    color: 0xc8d0e0,
    weight: 3,
    modifiers: {},
  },
  [ItemId.ElectricArrow]: {
    id: ItemId.ElectricArrow,
    kind: ItemKind.Effect,
    name: 'Elektryczna strzała',
    effect: 'strzał ogłusza (bossa krócej)',
    color: 0xfff06a,
    weight: 3,
    modifiers: {},
  },
  [ItemId.FireFist]: {
    id: ItemId.FireFist,
    kind: ItemKind.Effect,
    name: 'Ognista pięść',
    effect: 'cios podpala',
    color: 0xff6a2a,
    weight: 3,
    modifiers: {},
  },
  [ItemId.Quiver]: {
    id: ItemId.Quiver,
    kind: ItemKind.Effect,
    name: 'Kołczan',
    effect: '+1 ładunek strzału',
    color: 0xb07a40,
    weight: 3,
    modifiers: { rangedCharges: 1 },
  },
  [ItemId.VampireFang]: {
    id: ItemId.VampireFang,
    kind: ItemKind.Effect,
    name: 'Wampirzy kieł',
    effect: 'trafiony cios leczy',
    color: 0xb0203a,
    weight: 3,
    modifiers: {},
  },
  [ItemId.StormDash]: {
    id: ItemId.StormDash,
    kind: ItemKind.Effect,
    name: 'Burzowy pęd',
    effect: 'dash rani wrogów',
    color: 0x9a86ff,
    weight: 3,
    modifiers: {},
  },
  [ItemId.FrostShard]: {
    id: ItemId.FrostShard,
    kind: ItemKind.Effect,
    name: 'Lodowy odłamek',
    effect: 'strzał spowalnia',
    color: 0xa8f0ff,
    weight: 3,
    modifiers: {},
  },
};

/** Siła efektów przedmiotów: pierwsza kopia + przyrost za każdą kolejną. */
export const ITEM_EFFECTS: ItemEffectsConfig = {
  shuriken: { pierce: 1, piercePerStack: 1 },
  electricArrow: { stunMs: 900, stunMsPerStack: 300 },
  fireFist: { tickDamage: 3, tickDamagePerStack: 2, tickMs: 500, durationMs: 2000 },
  // Raz na 0,7 s: ok. 2,9 HP/s przy jednej kopii (bez limitu: 2 HP co cios = 6,25 HP/s, ok. 60% DPS Rushera).
  vampireFang: { heal: 2, healPerStack: 2, cooldownMs: 700 },
  stormDash: { damage: 10, damagePerStack: 6 },
  frostShard: { slowPct: 0.4, slowPctPerStack: 0.1, maxSlowPct: 0.7, durationMs: 1500 },
};

export const ITEM_POOL: readonly ItemDefinition[] = Object.values(ITEM_DEFINITIONS);

export const STAT_LIMITS: StatLimits = {
  /** Cooldowny nie spadną poniżej 50% bazowych. */
  minCooldownMultiplier: 0.5,
  /** Prędkość ruchu maks. +60%. */
  maxMoveSpeedMultiplier: 1.6,
  /** Kołczany: maks. 6 ładunków strzału. */
  maxRangedCharges: 6,
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

/** Boss: zawsze złoto i mikstura. Przedmiot gracz wybiera z kart (BOSS_REWARD), więc nie wypada na ziemię. */
export const BOSS_LOOT: LootTable = {
  gold: { min: 15, max: 25 },
  goldChance: 1,
  healthChance: 1,
  healthAmount: 30,
  itemChance: 0,
};

/** Nagroda za bossa: wybór 1 z tylu kart przedmiotów (różnych, losowanych z wagami z całej puli). */
export const BOSS_REWARD = {
  choices: 3,
  /** Karty są nieaktywne przez ten czas (ms) — chroni przed przypadkowym wyborem klikiem z walki. */
  armDelayMs: 900,
} as const;

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
  /** Limit czasu jednego zapytania do wspólnej listy; po nim zostaje lista lokalna. */
  remoteTimeoutMs: 5000,
  /** Ile niewysłanych wyników trzymamy w kolejce, gdy brak sieci. */
  maxOutbox: 20,
  /** Najdłuższe imię gracza na tablicy wyników. */
  nameMaxLength: 12,
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

/** Ukryta komnata za areną (krok 46): widać ją z 2 kafli; 4–6 kokonów, jeden z losowym przedmiotem. */
export const SECRET_ROOM_CONFIG: SecretRoomConfig = {
  revealRadius: 2,
  cocoons: { min: 4, max: 6 },
  wallMargin: 1,
};
