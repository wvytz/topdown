import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { STAIRS_SIZE } from '@/config/gameConfig';
import { findRoomEntrances } from '@/dungeon/arenaGates';

/** Odstęp bloku schodów od ścian areny (kafle) — zostaje przejście za schodami i miejsce na lico muru. */
export const STAIRS_WALL_INSET = 1;

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

/**
 * Narożnik areny dla schodów (krok 75, prośba właściciela: schody przy krawędzi areny, nie pod bossem):
 * blok `STAIRS_SIZE` × `STAIRS_SIZE` w tym narożniku, który jest najdalej od wejść do areny (w tym do
 * pokoju końcowego). Narożnik przy samym wejściu odpada. Remis rozstrzyga kolejność NW, NE, SE, SW.
 * Zwraca lewy górny róg bloku.
 */
export function planStairs(floor: Pick<DungeonFloor, 'width' | 'height' | 'tiles'>, arena: Room): TilePoint {
  const lo = { x: arena.x + STAIRS_WALL_INSET, y: arena.y + STAIRS_WALL_INSET };
  const hi = { x: arena.x + arena.width - STAIRS_WALL_INSET - STAIRS_SIZE, y: arena.y + arena.height - STAIRS_WALL_INSET - STAIRS_SIZE };
  const corners: TilePoint[] = [lo, { x: hi.x, y: lo.y }, hi, { x: lo.x, y: hi.y }];
  const entrances = findRoomEntrances(floor as DungeonFloor, arena);
  const clearance = (corner: TilePoint): number =>
    Math.min(...entrances.map((e) => (e.x - (corner.x + (STAIRS_SIZE - 1) / 2)) ** 2 + (e.y - (corner.y + (STAIRS_SIZE - 1) / 2)) ** 2), Infinity);
  let best = corners[0]!;
  for (const corner of corners) if (clearance(corner) > clearance(best)) best = corner;
  return best;
}

/** Środek areny w jednostkach kafli (może być ułamkowy) — tu staje i budzi się boss. */
export function arenaCenter(arena: Room): { x: number; y: number } {
  return { x: arena.x + arena.width / 2, y: arena.y + arena.height / 2 };
}
