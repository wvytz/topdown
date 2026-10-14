import { EnemyType, EnemyVariant } from '@/core/combatTypes';
import type { FloorDressingConfig } from '@/config/dressingConfig';
import { FLOOR_DRESSING, SPIDER_LAIR_DRESSING } from '@/config/dressingConfig';
import type { TilesetAsset } from '@/config/tilesetConfig';
import type { CeilingDropConfig } from '@/systems/CeilingDrops';
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
}

export const BIOMES: Readonly<Record<BiomeId, BiomeDefinition>> = {
  [BiomeId.TowerRuins]: {
    id: BiomeId.TowerRuins,
    name: 'Ruiny wieży',
    tileset: TILESET_ASSET,
    dressing: FLOOR_DRESSING,
    enemyVariants: { [EnemyType.Rusher]: EnemyVariant.TrashcanMan, [EnemyType.Kiter]: EnemyVariant.DemonMage },
    ceilingDrops: null,
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
  },
};

/** Biom na konkretnych piętrach; reszta to ruiny (krok 23a: pajęcze leże tylko na piętrze 2, z Matką Pająków). */
export const BIOME_BY_FLOOR: Readonly<Record<number, BiomeId>> = {
  2: BiomeId.SpiderLair,
};

export function biomeForFloor(floor: number): BiomeDefinition {
  return BIOMES[BIOME_BY_FLOOR[floor] ?? BiomeId.TowerRuins];
}
