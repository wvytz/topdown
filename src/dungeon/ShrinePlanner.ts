import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';

/**
 * Wybiera miejsce kapliczki: środek losowego zwykłego pokoju (nie startowego, nie areny bossa).
 * Zwraca null, jeśli piętro nie ma zwykłych pokojów.
 */
export function planShrineLocation(floor: DungeonFloor, rng: Rng): TilePoint | null {
  const candidates = floor.rooms.filter((room) => room.kind === RoomKind.Normal);
  if (candidates.length === 0) return null;
  const room = candidates[rng.int(0, candidates.length - 1)]!;
  const tile: TilePoint = { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
  return floor.tiles[tile.y * floor.width + tile.x] === TileType.Wall ? null : tile;
}
