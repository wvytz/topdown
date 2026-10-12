import type { PlayerStats } from '@/core/types';
import type { DungeonGeneratorConfig } from '@/core/dungeonTypes';

/** Rozdzielczość logiczna (skalowana trybem FIT). */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const TILE_SIZE = 32;

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
};

/** Na wyższych piętrach mapa rośnie i pojawia się więcej pokojów (z górnym limitem). */
export function getDungeonConfigForFloor(floor: number): DungeonGeneratorConfig {
  const growth = Math.min(floor - 1, 6);
  return {
    ...BASE_DUNGEON_CONFIG,
    widthTiles: BASE_DUNGEON_CONFIG.widthTiles + growth * 4,
    heightTiles: BASE_DUNGEON_CONFIG.heightTiles + growth * 2,
    roomCount: {
      min: BASE_DUNGEON_CONFIG.roomCount.min + growth,
      max: BASE_DUNGEON_CONFIG.roomCount.max + growth,
    },
  };
}

export const PLAYER_SIZE = 24;
export const PLAYER_COLOR = 0x3ddc84;

export const PLAYER_BASE_STATS: PlayerStats = {
  maxHp: 100,
  moveSpeed: 200,
};

export const CAMERA_CONFIG = {
  /** Interpolacja śledzenia (0..1) — mniejsza = płynniej. */
  lerp: 0.12,
  zoom: 1.5,
  /** Martwa strefa w px, w której gracz może się ruszać bez przesuwania kamery. */
  deadzoneWidth: 80,
  deadzoneHeight: 60,
} as const;
