import type { PlayerStats } from '@/core/types';
import type { DungeonGeneratorConfig } from '@/core/dungeonTypes';

/** Rozdzielczość logiczna (skalowana trybem FIT). */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const TILE_SIZE = 32;

/** Schody na kolejne piętro zajmują blok STAIRS_SIZE × STAIRS_SIZE kafli (64×64 px, krok 17). */
export const STAIRS_SIZE = 2;

export const BASE_DUNGEON_CONFIG: DungeonGeneratorConfig = {
  widthTiles: 60,
  heightTiles: 40,
  roomCount: { min: 6, max: 8 },
  roomSize: { min: 5, max: 10 },
  bossRoomSize: { min: 11, max: 13 },
  roomPadding: 2,
  corridorWidth: 2,
  extraConnectionRatio: 0.25,
  maxPlacementAttempts: 300,
  bossRoomAtEnd: true,
  endRoomChance: 0.5,
};

/** Na wyższych piętrach mapa rośnie i pojawia się więcej pokojów (z górnym limitem). */
export function getDungeonConfigForFloor(floor: number): DungeonGeneratorConfig {
  const growth = Math.min(floor - 1, 6);
  return {
    ...BASE_DUNGEON_CONFIG,
    // Krok 45: arena na końcu piętra wszędzie poza piętrem 1 (szybsze przejście do drugiego biomu).
    bossRoomAtEnd: floor !== 1,
    widthTiles: BASE_DUNGEON_CONFIG.widthTiles + growth * 4,
    heightTiles: BASE_DUNGEON_CONFIG.heightTiles + growth * 2,
    roomCount: {
      min: BASE_DUNGEON_CONFIG.roomCount.min + growth,
      max: BASE_DUNGEON_CONFIG.roomCount.max + growth,
    },
  };
}

export const PLAYER_SIZE = 24;

export const PLAYER_BASE_STATS: PlayerStats = {
  maxHp: 100,
  moveSpeed: 200,
};

export const CAMERA_CONFIG = {
  /** Interpolacja śledzenia (0..1) — mniejsza = płynniej. */
  lerp: 0.12,
  /** Stały zoom 2,0 (krok 18, decyzja właściciela): całkowita krotność, piksele bez zniekształceń. */
  zoom: 2,
  /** Martwa strefa w px świata, w której gracz może się ruszać bez przesuwania kamery
   *  (przy zoomie 1,5 było 80×60; przeliczone, by zajmowała tę samą część ekranu). */
  deadzoneWidth: 60,
  deadzoneHeight: 45,
} as const;

/**
 * Połowy boków prostokąta wokół gracza (px świata), który zawsze jest na ekranie:
 * widok kamery minus luz martwej strefy. Przy zoomie 2: 210 × 112,5 px.
 */
export const GUARANTEED_VIEW_HALF = {
  x: GAME_WIDTH / (2 * CAMERA_CONFIG.zoom) - CAMERA_CONFIG.deadzoneWidth / 2,
  y: GAME_HEIGHT / (2 * CAMERA_CONFIG.zoom) - CAMERA_CONFIG.deadzoneHeight / 2,
} as const;
