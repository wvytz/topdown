import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import { findRoomEntrances } from '@/dungeon/arenaGates';

/**
 * Winda w północnym murze areny (sprzątaczki, krok 125): dwa kafle muru obok siebie (`tile` to lewy) tuż nad
 * pierwszym rzędem areny, pod którymi leży podłoga — boss podchodzi do drzwi i wsiada. Najbliżej osi areny
 * i co najmniej `entranceClear` kafli od wejść w północnej ścianie. Brak miejsca = null.
 */
export function planElevator(floor: DungeonFloor, arena: Room, entranceClear: number): TilePoint | null {
  const y = arena.y - 1;
  const centerX = arena.x + Math.floor(arena.width / 2) - 1;
  const northEntrances = findRoomEntrances(floor, arena).filter((tile) => tile.y === y);
  const xs: number[] = [];
  for (let x = arena.x; x <= arena.x + arena.width - 2; x++) xs.push(x);
  xs.sort((a, b) => Math.abs(a - centerX) - Math.abs(b - centerX) || a - b);
  const at = (x: number, ty: number) => floor.tiles[ty * floor.width + x];
  for (const x of xs) {
    if (northEntrances.some((tile) => tile.x >= x - entranceClear && tile.x <= x + 1 + entranceClear)) continue;
    if (at(x, y) !== TileType.Wall || at(x + 1, y) !== TileType.Wall) continue;
    if (at(x, y + 1) !== TileType.Floor || at(x + 1, y + 1) !== TileType.Floor) continue;
    return { x, y };
  }
  return null;
}
