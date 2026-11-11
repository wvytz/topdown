import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { STAIRS_PLACEMENT, STAIRS_SIZE } from '@/config/gameConfig';
import { createRng, deriveSeed } from '@/core/random';
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

/** Narożnik areny z klatką schodową. */
export enum StairsCorner {
  NorthWest = 0,
  NorthEast = 1,
  SouthEast = 2,
  SouthWest = 3,
}

/** Sól strumienia RNG narożnika klatki (losowany raz na run). */
const STAIRWELL_SEED_SALT = 0x57a1;

/**
 * Narożnik klatki schodowej dla całego runu (krok 187, prośba właściciela: losowy narożnik, „klatka schodowa
 * w jednym pionie”) — ten sam na każdym piętrze, póki pozwala na to układ areny.
 */
export function runStairsCorner(runSeed: number): StairsCorner {
  return createRng(deriveSeed(runSeed, STAIRWELL_SEED_SALT)).int(0, 3) as StairsCorner;
}

/**
 * Narożnik areny dla schodów (krok 75: przy krawędzi areny, nie pod bossem): blok `STAIRS_SIZE` × `STAIRS_SIZE`
 * odsunięty o `STAIRS_WALL_INSET` od ścian. Od kroku 187 pierwszeństwo ma narożnik runu (`preferred`), o ile
 * środek bloku leży co najmniej `STAIRS_PLACEMENT.minEntranceDistance` kafli od każdego wejścia do areny (w tym do
 * pokoju końcowego). Inaczej — jak w kroku 75 — narożnik najdalszy od wejść; remis rozstrzyga kolejność NW, NE, SE, SW.
 * Zwraca lewy górny róg bloku.
 */
export function planStairs(floor: Pick<DungeonFloor, 'width' | 'height' | 'tiles'>, arena: Room, preferred?: StairsCorner): TilePoint {
  const lo = { x: arena.x + STAIRS_WALL_INSET, y: arena.y + STAIRS_WALL_INSET };
  const hi = { x: arena.x + arena.width - STAIRS_WALL_INSET - STAIRS_SIZE, y: arena.y + arena.height - STAIRS_WALL_INSET - STAIRS_SIZE };
  // Kolejność jak w StairsCorner: NW, NE, SE, SW.
  const corners: TilePoint[] = [lo, { x: hi.x, y: lo.y }, hi, { x: lo.x, y: hi.y }];
  const entrances = findRoomEntrances(floor as DungeonFloor, arena);
  const clearance = (corner: TilePoint): number =>
    Math.min(...entrances.map((e) => (e.x - (corner.x + (STAIRS_SIZE - 1) / 2)) ** 2 + (e.y - (corner.y + (STAIRS_SIZE - 1) / 2)) ** 2), Infinity);
  if (preferred !== undefined) {
    const wanted = corners[preferred]!;
    if (clearance(wanted) >= STAIRS_PLACEMENT.minEntranceDistance ** 2) return wanted;
  }
  let best = corners[0]!;
  for (const corner of corners) if (clearance(corner) > clearance(best)) best = corner;
  return best;
}

/** Środek areny w jednostkach kafli (może być ułamkowy) — tu staje i budzi się boss. */
export function arenaCenter(arena: Room): { x: number; y: number } {
  return { x: arena.x + arena.width / 2, y: arena.y + arena.height / 2 };
}
