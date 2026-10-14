import { EnemyType, EnemyVariant } from '@/core/combatTypes';
import type { FloorDressingConfig } from '@/config/dressingConfig';
import { FLOOR_DRESSING, SPIDER_LAIR_DRESSING } from '@/config/dressingConfig';
import type { TilesetAsset } from '@/config/tilesetConfig';
import type { CeilingDropConfig } from '@/systems/CeilingDrops';
import type { CocoonConfig } from '@/systems/Cocoons';
import type { StickyWebConfig } from '@/systems/StickyWebs';
import { SPIDER_QUEEN } from '@/config/bossConfig';
import { SPIDER_LAIR_TILESET_ASSET, TILESET_ASSET } from '@/config/tilesetConfig';

/** Biomy wieży (krok 23): wygląd piętra, a od kolejnych kroków także jego zasady. */
export enum BiomeId {
  TowerRuins = 'tower-ruins',
  SpiderLair = 'spider-lair',
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
}

export const BIOMES: Readonly<Record<BiomeId, BiomeDefinition>> = {
  [BiomeId.TowerRuins]: {
    id: BiomeId.TowerRuins,
    name: 'Ruiny wieży',
    tileset: TILESET_ASSET,
    dressing: FLOOR_DRESSING,
    enemyVariants: { [EnemyType.Rusher]: EnemyVariant.TrashcanMan, [EnemyType.Kiter]: EnemyVariant.DemonMage },
    ceilingDrops: null,
    cocoons: null,
    stickyWebs: null,
  },
  [BiomeId.SpiderLair]: {
    id: BiomeId.SpiderLair,
    name: 'Pajęcze leże',
    tileset: SPIDER_LAIR_TILESET_ASSET,
    dressing: SPIDER_LAIR_DRESSING,
    // Mała liczba archetypów (decyzja właściciela): pająki to Rushery, nietoperz z falą to Kiter.
    enemyVariants: { [EnemyType.Rusher]: EnemyVariant.CaveSpider, [EnemyType.Kiter]: EnemyVariant.Bat },
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
  },
};

/** Biom na konkretnych piętrach; reszta to ruiny (krok 23a: pajęcze leże tylko na piętrze 2, z Matką Pająków). */
export const BIOME_BY_FLOOR: Readonly<Record<number, BiomeId>> = {
  2: BiomeId.SpiderLair,
};

export function biomeForFloor(floor: number): BiomeDefinition {
  return BIOMES[BIOME_BY_FLOOR[floor] ?? BiomeId.TowerRuins];
}
