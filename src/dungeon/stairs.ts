import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { STAIRS_SIZE } from '@/config/gameConfig';

/** Kafle bloku schodów; `floor.stairs` to jego lewy górny róg. */
export function stairsTiles(floor: DungeonFloor): TilePoint[] {
  const tiles: TilePoint[] = [];
  for (let dy = 0; dy < STAIRS_SIZE; dy++) {
    for (let dx = 0; dx < STAIRS_SIZE; dx++) tiles.push({ x: floor.stairs.x + dx, y: floor.stairs.y + dy });
  }
  return tiles;
}

export function isStairsTile(floor: DungeonFloor, tile: TilePoint): boolean {
  return (
    tile.x >= floor.stairs.x &&
    tile.x < floor.stairs.x + STAIRS_SIZE &&
    tile.y >= floor.stairs.y &&
    tile.y < floor.stairs.y + STAIRS_SIZE
  );
}

/** Środek bloku schodów w jednostkach kafli (może być ułamkowy) — tu budzi się boss. */
export function stairsCenter(floor: DungeonFloor): { x: number; y: number } {
  return { x: floor.stairs.x + STAIRS_SIZE / 2, y: floor.stairs.y + STAIRS_SIZE / 2 };
}
