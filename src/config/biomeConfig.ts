import type { FloorDressingConfig } from '@/config/dressingConfig';
import { FLOOR_DRESSING, SPIDER_LAIR_DRESSING } from '@/config/dressingConfig';
import type { TilesetAsset } from '@/config/tilesetConfig';
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
}

export const BIOMES: Readonly<Record<BiomeId, BiomeDefinition>> = {
  [BiomeId.TowerRuins]: { id: BiomeId.TowerRuins, name: 'Ruiny wieży', tileset: TILESET_ASSET, dressing: FLOOR_DRESSING },
  [BiomeId.SpiderLair]: {
    id: BiomeId.SpiderLair,
    name: 'Pajęcze leże',
    tileset: SPIDER_LAIR_TILESET_ASSET,
    dressing: SPIDER_LAIR_DRESSING,
  },
};

/** Biom na konkretnych piętrach; reszta to ruiny (krok 23a: pajęcze leże tylko na piętrze 2, z Matką Pająków). */
export const BIOME_BY_FLOOR: Readonly<Record<number, BiomeId>> = {
  2: BiomeId.SpiderLair,
};

export function biomeForFloor(floor: number): BiomeDefinition {
  return BIOMES[BIOME_BY_FLOOR[floor] ?? BiomeId.TowerRuins];
}
