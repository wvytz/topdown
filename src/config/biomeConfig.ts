import { TOWER_CONFIG } from '@/config/towerConfig';
import type { BreakableConfig, DartConfig, SpikeConfig } from '@/systems/Traps';
import { floorInLoop } from '@/systems/TowerLoop';
import { EnemyType, EnemyVariant } from '@/core/combatTypes';
import type { FloorDressingConfig } from '@/config/dressingConfig';
import { FLOOR_DRESSING, FUNGAL_GROVE_DRESSING, GRAVEYARD_DRESSING, INFERNAL_DRESSING, SMOKE_DEN_DRESSING, SPIDER_LAIR_DRESSING } from '@/config/dressingConfig';
import type { FogConfig } from '@/config/lightingConfig';
import { FUNGAL_FOG, GRAVEYARD_MIST, INFERNAL_HAZE, SMOKE_HAZE } from '@/config/lightingConfig';
import type { TilesetAsset } from '@/config/tilesetConfig';
import type { CeilingDropConfig } from '@/systems/CeilingDrops';
import type { CocoonConfig } from '@/systems/Cocoons';
import type { PuffballConfig } from '@/systems/Puffballs';
import type { StickyWebConfig } from '@/systems/StickyWebs';
import type { BrazierConfig } from '@/systems/Braziers';
import type { WallDogConfig } from '@/systems/WallDogs';
import { SPIDER_QUEEN } from '@/config/bossConfig';
import {
  FUNGAL_GROVE_TILESET_ASSET,
  GRAVEYARD_TILESET_ASSET,
  INFERNAL_TILESET_ASSET,
  SMOKE_DEN_TILESET_ASSET,
  SPIDER_LAIR_TILESET_ASSET,
  TILESET_ASSET,
} from '@/config/tilesetConfig';

/** Biomy wieży (krok 23): wygląd piętra, a od kolejnych kroków także jego zasady. */
export enum BiomeId {
  TowerRuins = 'tower-ruins',
  SpiderLair = 'spider-lair',
  FungalGrove = 'fungal-grove',
  Graveyard = 'graveyard',
  Infernal = 'infernal',
  SmokeDen = 'smoke-den',
}

export interface BiomeDefinition {
  readonly id: BiomeId;
  readonly name: string;
  readonly tileset: TilesetAsset;
  readonly dressing: FloorDressingConfig;
  /** Wariant każdego archetypu wroga na piętrach biomu (krok 23b). */
  readonly enemyVariants: Readonly<Record<EnemyType, EnemyVariant>>;
  /** Pająki spadające z sufitu (krok 23c); null = brak. */
  readonly ceilingDrops: CeilingDropConfig | null;
  /** Kokony na podłodze zwykłych pokojów (krok 23d); null = brak. */
  readonly cocoons: CocoonConfig | null;
  /** Lepkie pajęczyny na podłodze zwykłych pokojów (krok 23e); null = brak. */
  readonly stickyWebs: StickyWebConfig | null;
  /** Purchawki z trującą chmurą w zwykłych pokojach (krok 28c); null = brak. */
  readonly puffballs: PuffballConfig | null;
  /** Mgła ograniczająca widok zamiast zwykłego mroku (krok 28a); null = zwykłe światło. */
  readonly fog: FogConfig | null;
  /** Buchające paleniska na środku zwykłych pokojów (krok 41b); null = brak. */
  readonly braziers: BrazierConfig | null;
  /** Pułapki ruin (krok 48): pasy kolców i strzałki z murów; null = brak. */
  readonly traps: { readonly spikes: SpikeConfig | null; readonly darts: DartConfig | null } | null;
  /** Urny i skrzynie do rozbicia (krok 48); null = brak. */
  readonly breakables: BreakableConfig | null;
  /** Psy przegryzające się przez ściany pokoi (krok 84); brak = bez nich. */
  readonly wallDogs?: WallDogConfig | null;
}

export const BIOMES: Readonly<Record<BiomeId, BiomeDefinition>> = {
  [BiomeId.TowerRuins]: {
    id: BiomeId.TowerRuins,
    name: 'Ruiny wieży',
    tileset: TILESET_ASSET,
    dressing: FLOOR_DRESSING,
    enemyVariants: { [EnemyType.Rusher]: EnemyVariant.TrashcanMan, [EnemyType.Kiter]: EnemyVariant.DemonMage, [EnemyType.Nester]: EnemyVariant.BroodSac },
    ceilingDrops: null,
    cocoons: null,
    stickyWebs: null,
    puffballs: null,
    fog: null,
    braziers: null,
    // Krok 48 (właściciel: „pierwszy poziom wydaje się pusty i bez wyzwania”). Kolce i strzałki ostrzegają
    // wyraźnie i ranią umiarkowanie — wyzwanie, ale nie kara dla nowych graczy.
    traps: {
      spikes: {
        roomChance: 0.35,
        minShortSide: 5,
        timing: { downMs: 1600, warnMs: 600, upMs: 900 },
        damage: 10,
        knockback: 160,
      },
      darts: {
        roomChance: 0.3,
        plateDistance: { min: 2, max: 3 },
        minLine: 6,
        windupMs: 450,
        volley: 3,
        volleyIntervalMs: 160,
        cooldownMs: 2500,
        damage: 9,
        knockback: 140,
        speed: 360,
      },
    },
    breakables: { roomChance: 0.9, perRoom: { min: 1, max: 3 }, crateChance: 0.35, urnVariants: 2, radius: 9 },
  },
  [BiomeId.SpiderLair]: {
    id: BiomeId.SpiderLair,
    name: 'Pajęcze leże',
    tileset: SPIDER_LAIR_TILESET_ASSET,
    dressing: SPIDER_LAIR_DRESSING,
    // Mała liczba archetypów (decyzja właściciela): pająki to Rushery, nietoperz z falą to Kiter.
    enemyVariants: { [EnemyType.Rusher]: EnemyVariant.CaveSpider, [EnemyType.Kiter]: EnemyVariant.Bat, [EnemyType.Nester]: EnemyVariant.SilkMother },
    // Pająki z sufitu: rosnący cień blisko gracza, przy lądowaniu rani stojącego w cieniu, potem walczy jak Rusher.
    // Tylko zwykłe pokoje (nie startowy, nie arena); obrażenia skalowane z piętrem jak u wrogów.
    ceilingDrops: {
      firstDelayMs: 2500,
      intervalMs: { min: 5000, max: 9000 },
      maxPerRoom: 2,
      maxAlive: 3,
      offset: { min: 0, max: 40 },
      telegraphMs: 1100,
      fallMs: 220,
      radius: 16,
      damage: 12,
      knockback: 200,
      placementTries: 6,
    },
    // Kokony (decyzje właściciela, krok 23d): 0–2 w zwykłym pokoju, bez kolizji; podejście budzi kokon,
    // a po krótkim telegrafie wybuch spowalnia gracza w strefie i wypuszcza pajączka-kamikaze.
    // Cios, strzał lub dash rozrywa kokon od razu — z dystansu bez spowolnienia.
    cocoons: {
      perRoom: { min: 0, max: 2 },
      wallMarginTiles: 1,
      centerClearTiles: 1,
      minSpacingTiles: 3,
      radius: 9,
      // Budzi go dopiero bliski kontakt; telegraf krótszy niż reakcja + ucieczka chodem (dash zdąży).
      triggerRadius: 26,
      fuseMs: 300,
      blastRadius: 48,
      slow: { pct: 0.4, durationMs: 2500 },
      spiderlings: 1,
      spiderling: SPIDER_QUEEN.spiderling,
    },
    // Lepkie pajęczyny (decyzje właściciela, krok 23e): 0–2 w zwykłym pokoju, losowo 1×1 albo 2×2,
    // trwałe (nie da się ich zniszczyć). Spowalniają tylko gracza: 50% w środku i jeszcze 0,5 s po wyjściu;
    // dash przechodzi bez spowolnienia.
    stickyWebs: {
      perRoom: { min: 0, max: 2 },
      largeChance: 0.5,
      wallMarginTiles: 1,
      centerClearTiles: 1,
      minGapTiles: 2,
      slow: { pct: 0.5, durationMs: 500 },
    },
    puffballs: null,
    fog: null,
    braziers: null,
    traps: null,
    breakables: null,
  },
  // Grzybnia (krok 28a): piętro zainfekowanego Króla Pająków. Ciemny fiolet z błękitem, mgła ogranicza widok,
  // grzyby-latarnie zamiast pochodni. Wrogowie (krok 28b): zarażony pająk (Rusher) i grzybiec (Kiter) — obaj zatruwają.
  [BiomeId.FungalGrove]: {
    id: BiomeId.FungalGrove,
    name: 'Grzybnia',
    tileset: FUNGAL_GROVE_TILESET_ASSET,
    dressing: FUNGAL_GROVE_DRESSING,
    enemyVariants: { [EnemyType.Rusher]: EnemyVariant.InfectedSpider, [EnemyType.Kiter]: EnemyVariant.Fungoid, [EnemyType.Nester]: EnemyVariant.Puffcap },
    ceilingDrops: null,
    cocoons: null,
    stickyWebs: null,
    // Purchawki (krok 28c): 1–3 w zwykłym pokoju (biom „pełniejszy” od leża), bez kolizji. Podejście budzi
    // purchawkę — nabrzmiewa, a potem pęka trującą chmurą, która chwilę wisi i zamyka przejście.
    // Cios, strzał lub dash rozrywa ją od razu: z dystansu da się ją rozbroić, ale chmura i tak zostaje.
    puffballs: {
      perRoom: { min: 1, max: 3 },
      wallMarginTiles: 1,
      centerClearTiles: 1,
      minSpacingTiles: 3,
      radius: 8,
      // Telegraf dłuższy niż u kokonu: uważny gracz wyjdzie chodem poza chmurę, zanim urośnie.
      triggerRadius: 22,
      fuseMs: 500,
      cloud: {
        startRadius: 20,
        maxRadius: 44,
        spreadMs: 400,
        durationMs: 4000,
        // Jak trucizna zarażonego pająka (2 co 0,5 s); po wyjściu truje jeszcze 1,5 s.
        poison: { tickDamage: 2, tickMs: 500, durationMs: 1500 },
      },
    },
    fog: FUNGAL_FOG,
    braziers: null,
    traps: null,
    breakables: null,
  },
  // Cmentarzysko (krok 32a): ludzki biom nad Grzybnią — tu upadli zatruci; jedni się rozkładają, inni zmieniają
  // w grzybowe zombie. Grzyb ledwo dociera. Paleta C „trupia zieleń” (wybór właściciela), świece zamiast
  // pochodni, zimna mgiełka. Wrogowie (krok 32b): zarażony (Rusher) i siewca (Kiter) — ludzie w grzybowe zombie.
  [BiomeId.Graveyard]: {
    id: BiomeId.Graveyard,
    name: 'Cmentarzysko',
    tileset: GRAVEYARD_TILESET_ASSET,
    dressing: GRAVEYARD_DRESSING,
    enemyVariants: { [EnemyType.Rusher]: EnemyVariant.Zombie, [EnemyType.Kiter]: EnemyVariant.Sower, [EnemyType.Nester]: EnemyVariant.Necromancer },
    ceilingDrops: null,
    cocoons: null,
    stickyWebs: null,
    puffballs: null,
    fog: GRAVEYARD_MIST,
    braziers: null,
    traps: null,
    breakables: null,
  },
  // Piekło (krok 41a, prośba właściciela): krwisty, demoniczny biom z pomarańczowym żarem; paleta A
  // „krwawy bazalt” (wybór właściciela). Wrogowie (krok 41d): piekielny ogar (Rusher) i kultysta popiołu
  // (Kiter); boss do czasu Kata Otchłani: Strażnik.
  [BiomeId.Infernal]: {
    id: BiomeId.Infernal,
    name: 'Piekło',
    tileset: INFERNAL_TILESET_ASSET,
    dressing: INFERNAL_DRESSING,
    enemyVariants: { [EnemyType.Rusher]: EnemyVariant.Hellhound, [EnemyType.Kiter]: EnemyVariant.Cultist, [EnemyType.Nester]: EnemyVariant.ImpMother },
    ceilingDrops: null,
    cocoons: null,
    stickyWebs: null,
    puffballs: null,
    fog: INFERNAL_HAZE,
    // Paleniska (krok 41b, decyzje właściciela): na środku zwykłych pokojów, buchają w niezbyt szybkim tempie;
    // na wyższych („gorętszych”) piętrach przerwa się skraca (×0,7 na piętro), ostrzeżenie zostaje 1 s.
    braziers: {
      roomChance: 0.8,
      twoFromLongSide: 9,
      minShortSide: 5,
      contact: { radius: 14, damage: 4, knockback: 140 },
      burst: { radius: 46, damage: 12, knockback: 220 },
      timing: { idleMs: 4200, warnMs: 1000, burstMs: 700 },
      heatBaseFloor: 5,
      idlePerFloor: 0.7,
      minIdleMs: 1800,
    },
    traps: null,
    breakables: null,
  },
  // Zadymiona palarnia (krok 83, prośba właściciela: boss „następnego poziomu”): piętro Barona Dymu. Na razie
  // osobny arkusz kafli (nikotynowa szarość, `--biome smoke_den`), a nastrój robi gęsty szary dym zamiast mroku.
  // Wrogowie: ogar (Rusher, pies pasuje do Barona) i kultysta (Kiter).
  [BiomeId.SmokeDen]: {
    id: BiomeId.SmokeDen,
    name: 'Zadymiona palarnia',
    tileset: SMOKE_DEN_TILESET_ASSET,
    dressing: SMOKE_DEN_DRESSING,
    // Rusher to wielki czarny dog (pies Barona), Kiter — kultysta.
    enemyVariants: { [EnemyType.Rusher]: EnemyVariant.BlackDog, [EnemyType.Kiter]: EnemyVariant.Cultist, [EnemyType.Nester]: EnemyVariant.Hookah },
    ceilingDrops: null,
    cocoons: null,
    stickyWebs: null,
    // Popielniczki (krok 84, prośba właściciela: dymne pułapki): 1–2 w zwykłym pokoju, bez kolizji. Podejście budzi
    // popielniczkę, po krótkim telegrafie buchają kłęby dymu (chmura kaszle: trucizna jak w Grzybni), która wisi
    // i zamyka przejście. Cios, strzał lub dash przewraca ją od razu — chmura i tak zostaje.
    puffballs: {
      look: 'ashtray',
      perRoom: { min: 1, max: 2 },
      wallMarginTiles: 1,
      centerClearTiles: 1,
      minSpacingTiles: 3,
      radius: 9,
      triggerRadius: 24,
      fuseMs: 600,
      cloud: {
        startRadius: 20,
        maxRadius: 44,
        spreadMs: 400,
        durationMs: 4500,
        poison: { tickDamage: 2, tickMs: 500, durationMs: 1500 },
      },
    },
    fog: SMOKE_HAZE,
    braziers: null,
    traps: null,
    breakables: null,
    // Pies w ścianie (krok 84): w co trzecim–czwartym zwykłym pokoju; podejście do rysy w murze budzi psa.
    wallDogs: { roomChance: 0.3, minShortSide: 5, maxPerFloor: 3, triggerRadius: 52, crackMs: 900 },
  },
};

/**
 * Biom na piętrach pierwszego kręgu (1–7); piętro 1 to ruiny. Kolejne kręgi powtarzają ten układ (krok 43). Każdy biom to jedno piętro zakończone swoim bossem
 * (decyzja właściciela po kroku 27): 2 — leże z Matką Pająków, 3 — Grzybnia z Królem Pająków,
 * 4 — Cmentarzysko (krok 32a, Grzybowy Pożeracz), 5–6 — Piekło (krok 41; dwa piętra, Kat Otchłani na końcu 6.;
 * do tego czasu Strażnik).
 */
export const BIOME_BY_FLOOR: Readonly<Record<number, BiomeId>> = {
  2: BiomeId.SpiderLair,
  3: BiomeId.FungalGrove,
  4: BiomeId.Graveyard,
  // Piekło ma dwa piętra (decyzja właściciela po kroku 41b): na 6, „gorętszym”, paleniska buchają częściej.
  5: BiomeId.Infernal,
  6: BiomeId.Infernal,
  7: BiomeId.SmokeDen,
};

/** Biom piętra; od piętra 7 kolejny krąg wieży powtarza biomy 1–6 (krok 43). */
export function biomeForFloor(floor: number): BiomeDefinition {
  return BIOMES[BIOME_BY_FLOOR[floorInLoop(floor, TOWER_CONFIG)] ?? BiomeId.TowerRuins];
}
