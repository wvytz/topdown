import type { SecretRoomConfig } from '@/dungeon/SecretRoom';
import { EnemyType } from '@/core/combatTypes';
import type { ItemDefinition, ItemEffectsConfig, LootScalingConfig, LootTable, StatLimits } from '@/core/lootTypes';
import { ItemId, ItemKind } from '@/core/lootTypes';
import type { ShrineConfig } from '@/systems/Shrine';
import { ITEM_EVOLUTION } from '@/config/itemEvolutionConfig';
import { RELIC_CONFIG } from '@/config/relicConfig';
import { VOTIVE_CONFIG } from '@/config/votiveConfig';

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
    effect: '+12% tempa ataku',
    color: 0xf0a040,
    weight: 5,
    // Krok 117: tempo zamiast czasu ataku — każda kopia daje tyle samo (wcześniej −12% czasu: 5 kopii = ×2 ciosów).
    modifiers: { attackSpeedPct: 0.12 },
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
    // Krok 150: ogłuszenie nie działało na bossach — od 1. kopii piorun przeskakuje z trafionego na sąsiada.
    effect: 'strzał razi piorunem sąsiada i ogłusza',
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

  // Krok 170: relikwie bossów (decyzja właściciela 4a) — waga 0: tylko z karty za swojego bossa.
  [ItemId.SlimeCrown]: {
    id: ItemId.SlimeCrown,
    kind: ItemKind.Relic,
    name: 'Korona Szlamu',
    effect: 'co 8 s jedno trafienie zadaje ci połowę obrażeń',
    color: 0x9a5ad8,
    weight: 0,
    modifiers: {},
  },
  [ItemId.SpiderSilk]: {
    id: ItemId.SpiderSilk,
    kind: ItemKind.Relic,
    name: 'Pajęczy jedwab',
    effect: 'każde trafienie oplątuje: wróg −30% szybkości na 2 s',
    color: 0xe8e4f0,
    weight: 0,
    modifiers: {},
  },
  [ItemId.DevourerTooth]: {
    id: ItemId.DevourerTooth,
    kind: ItemKind.Relic,
    name: 'Ząb Pożeracza',
    effect: 'zabity wróg leczy 3 HP',
    color: 0x8fbf5a,
    weight: 0,
    modifiers: {},
  },
  [ItemId.HeadsmanAxe]: {
    id: ItemId.HeadsmanAxe,
    kind: ItemKind.Relic,
    // Krok 182: Kata Otchłani zastąpił Palacz — ta sama relikwia, nowa nazwa.
    name: 'Pogrzebacz Palacza',
    effect: 'wróg poniżej 20% HP ginie od trafienia (bossowie nie)',
    color: 0xd23a3a,
    weight: 0,
    modifiers: {},
  },
  [ItemId.BaronPipe]: {
    id: ItemId.BaronPipe,
    kind: ItemKind.Relic,
    name: 'Fajka Barona',
    effect: 'pasek mocy (R) ładuje się 2× szybciej',
    color: 0x9a8f84,
    weight: 0,
    modifiers: {},
  },
  [ItemId.WetMop]: {
    id: ItemId.WetMop,
    kind: ItemKind.Relic,
    name: 'Mokry mop',
    effect: '+1 ładunek dasha',
    color: 0x5ab8d8,
    weight: 0,
    modifiers: {},
  },
  [ItemId.StorkFeather]: {
    id: ItemId.StorkFeather,
    kind: ItemKind.Relic,
    name: 'Bocianie pióro',
    effect: '+15% prędkości i +10% tempa ataku',
    color: 0xf0ece0,
    weight: 0,
    modifiers: { moveSpeedPct: 0.15, attackSpeedPct: 0.1 },
  },

  // Krok Z3 (Akt II): Wota — przedmioty ochronne. W puli dopiero po wypaleniu w Piecu wotów (`poolWithVotives`);
  // waga jak u przedmiotów z efektem. Bez przemiany 3. kopii.
  [ItemId.Carapace]: {
    id: ItemId.Carapace,
    kind: ItemKind.Votive,
    name: 'Pancerz z odwłoka',
    effect: 'trucizna rani o połowę mniej (2 kopie — wcale)',
    color: 0x6fae3a,
    weight: 3,
    modifiers: {},
  },
  [ItemId.ShieldCore]: {
    id: ItemId.ShieldCore,
    kind: ItemKind.Votive,
    name: 'Rdzeń Tarczownika',
    effect: 'ogień rani o połowę mniej (2 kopie — wcale)',
    color: 0xe0782a,
    weight: 3,
    modifiers: {},
  },
  [ItemId.StoneScale]: {
    id: ItemId.StoneScale,
    kind: ItemKind.Votive,
    name: 'Kamienna łuska',
    effect: '−8% wszystkich obrażeń (do −30%)',
    color: 0xa8a090,
    weight: 3,
    modifiers: {},
  },
  [ItemId.GuideBone]: {
    id: ItemId.GuideBone,
    kind: ItemKind.Votive,
    name: 'Kość psa-przewodnika',
    effect: 'raz na piętro śmiertelny cios zostawia 1 HP',
    color: 0xe8dcc0,
    weight: 3,
    modifiers: {},
  },
  // Krok Z4: druga paczka wot (projekty z 25.10).
  [ItemId.JadeMask]: {
    id: ItemId.JadeMask,
    kind: ItemKind.Votive,
    name: 'Jadeitowa maska',
    effect: 'pociski ranią o 25% mniej (do 50%)',
    color: 0x3fb08a,
    weight: 3,
    modifiers: {},
  },
  [ItemId.ObsidianMirror]: {
    id: ItemId.ObsidianMirror,
    kind: ItemKind.Votive,
    name: 'Obsydianowe zwierciadło',
    effect: 'co 8 s odbija pocisk we wrogów (×2)',
    color: 0x6a5a8a,
    weight: 3,
    modifiers: {},
  },
  [ItemId.JaguarHide]: {
    id: ItemId.JaguarHide,
    kind: ItemKind.Votive,
    name: 'Skóra jaguara',
    effect: 'wróg, który cię trafi wręcz, dostaje 10 obrażeń',
    color: 0xd8a040,
    weight: 3,
    modifiers: {},
  },
  [ItemId.QuetzalFeather]: {
    id: ItemId.QuetzalFeather,
    kind: ItemKind.Votive,
    name: 'Pióro kecala',
    effect: 'po dashu jeszcze 0,25 s nietykalności',
    color: 0x40c070,
    weight: 3,
    modifiers: {},
  },
};

/** Siła efektów przedmiotów: pierwsza kopia + przyrost za każdą kolejną. */
export const ITEM_EFFECTS: ItemEffectsConfig = {
  shuriken: { pierce: 1, piercePerStack: 1 },
  electricArrow: { stunMs: 900, stunMsPerStack: 300 },
  // Krok 93: przyrost kolejnych kopii maleje o połowę — tyknięcie 3 / 5 / 6 / 7 / 7 (wcześniej liniowo do 11).
  fireFist: { tickDamage: 3, tickDamagePerStack: 2, stackDecay: 0.5, tickMs: 500, durationMs: 2000 },
  // Krok 93: malejący przyrost i sufit 4% maks. HP/s.
  // Krok 117 (ocena właściciela: kieł to „jedyny słuszny wybór”): leczenie 2 / 3 / 4 / 4 raz na 1 s
  // (wcześniej 2 / 4 / 5 / 6 co 0,7 s), a sufit liczony od bazowego HP bohatera, więc Serca go nie podnoszą:
  // barbarzyńca 4 HP/s, łucznik 3,4, Czarodziejka 3 (wcześniej barbarzyńca z 260 HP — 10,4 HP/s).
  vampireFang: { heal: 2, healPerStack: 1, stackDecay: 0.5, maxHpPctPerSec: 0.04, cooldownMs: 1000 },
  stormDash: { damage: 10, damagePerStack: 6 },
  frostShard: { slowPct: 0.4, slowPctPerStack: 0.1, maxSlowPct: 0.7, durationMs: 1500 },
  evolution: ITEM_EVOLUTION,
  relics: RELIC_CONFIG,
  votives: VOTIVE_CONFIG,
};

/**
 * Pula łupów, kart i kapliczki — bez relikwii (krok 170: relikwia tylko z karty za swojego bossa) i bez wot
 * (krok Z3: wotum wchodzi do puli dopiero po wypaleniu w Popielniku — `poolWithVotives`).
 */
export const ITEM_POOL: readonly ItemDefinition[] = Object.values(ITEM_DEFINITIONS).filter((item) => item.kind !== ItemKind.Relic && item.kind !== ItemKind.Votive);

/** Wszystkie przedmioty z relikwiami (sloty HUD, opisy). */
export const ALL_ITEMS: readonly ItemDefinition[] = Object.values(ITEM_DEFINITIONS);

export const STAT_LIMITS: StatLimits = {
  /** Cooldowny nie spadną poniżej 50% bazowych. */
  minCooldownMultiplier: 0.5,
  /** Krok 117: Rękawice maks. +60% tempa ataku (5 kopii); szał barbarzyńcy ×0,8 dochodzi do 50% bazowego czasu. */
  maxAttackSpeedBonus: 0.6,
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
  // Czyhacz (krok 123): nagroda za ryzyko zasadzki — zawsze złoto, więcej niż u gniazda.
  [EnemyType.Lurker]: {
    gold: { min: 4, max: 7 },
    goldChance: 1,
    healthChance: 0.15,
    healthAmount: 15,
    itemChance: 0.06,
  },
  // Gniazdownik (krok 122): nagroda za wybicie gniazda — trochę więcej złota; czerwie nie mają łupu.
  [EnemyType.Nester]: {
    gold: { min: 3, max: 5 },
    goldChance: 0.9,
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
  /** Krok 89: testowo 5 (wcześniej 3) — czeka na ocenę właściciela. */
  podiumSize: 5,
  /** Limit czasu jednego zapytania do wspólnej listy; po nim zostaje lista lokalna. */
  remoteTimeoutMs: 5000,
  /** Ile niewysłanych wyników trzymamy w kolejce, gdy brak sieci. */
  maxOutbox: 20,
  /** Najdłuższe imię gracza na tablicy wyników. */
  nameMaxLength: 12,
} as const;

/**
 * Tablice wyników (krok 91a): wspinaczka i osobna tablica aren bossów — klucze magazynu i trasy workera.
 * `seenKey` (krok 94): ostatnio oglądane miejsce własnego rekordu na ekranie startowym.
 */
export const HIGHSCORE_BOARDS = {
  tower: {
    storageKey: 'tower-crawler.highscores.v1',
    outboxKey: 'tower-crawler.highscores.outbox.v1',
    seenKey: 'tower-crawler.highscores.seen.v1',
    path: '/scores',
  },
  arenas: {
    storageKey: 'tower-crawler.arena-highscores.v1',
    outboxKey: 'tower-crawler.arena-highscores.outbox.v1',
    seenKey: 'tower-crawler.arena-highscores.seen.v1',
    path: '/arena-scores',
  },
  /** Co-op (etap C7, decyzja właściciela: osobna tablica): wynik drużyny = wspólne złoto w chwili śmierci obu. */
  coop: {
    storageKey: 'tower-crawler.coop-highscores.v1',
    outboxKey: 'tower-crawler.coop-highscores.outbox.v1',
    seenKey: 'tower-crawler.coop-highscores.seen.v1',
    path: '/coop-scores',
  },
  /** Zejście (Akt II, krok Z1): własna tablica; do czasu trasy w workerze (etap Z5) tylko lokalna (`path: null`). */
  descent: {
    storageKey: 'tower-crawler.descent-highscores.v1',
    outboxKey: 'tower-crawler.descent-highscores.outbox.v1',
    seenKey: 'tower-crawler.descent-highscores.seen.v1',
    path: null,
  },
} as const;

export type HighscoreBoardId = keyof typeof HIGHSCORE_BOARDS;

export const PICKUP_CONFIG = {
  /** Z tej odległości mikstury i przedmioty same lecą do gracza. */
  magnetRadius: 80,
  magnetSpeed: 340,
  /** Odległość zebrania (środek–środek). */
  collectRadius: 18,
  /** Chwila po wypadnięciu, zanim łup da się zebrać — widać „rozsypanie”. */
  collectDelayMs: 300,
  scatterSpeed: 120,
  /** Ile monet maksymalnie wypada z jednej kwoty złota. */
  maxCoinsPerDrop: 5,
  /**
   * Krok 143 (ocena właściciela: „dlaczego mam się cofać po coiny?”): złoto po rozsypaniu samo leci do najbliższego
   * żywego bohatera z każdej odległości i przez ściany, coraz szybciej. Mikstury i przedmioty zostają na ziemi.
   */
  goldHoming: { startSpeed: 160, acceleration: 1600, maxSpeed: 900 },
} as const;

/** Ukryta komnata za areną (krok 46): widać ją z 2 kafli; 4–6 kokonów, jeden z losowym przedmiotem. */
export const SECRET_ROOM_CONFIG: SecretRoomConfig = {
  revealRadius: 2,
  cocoons: { min: 4, max: 6 },
  wallMargin: 1,
};

/** Urny i skrzynie w ruinach (krok 48): drobne złoto, rzadko mała mikstura, bez przedmiotów. */
export const BREAKABLE_LOOT: LootTable = {
  gold: { min: 1, max: 2 },
  goldChance: 0.6,
  healthChance: 0.06,
  healthAmount: 10,
  itemChance: 0,
};
