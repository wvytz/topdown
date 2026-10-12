import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { getDungeonConfigForFloor } from '@/config/gameConfig';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';

/**
 * Buduje piętro z rysunku ASCII: `#` = ściana, `.` = podłoga.
 * Pokoje podaje się osobno — przydaje się do testów precyzyjnych przypadków.
 */
export function floorFromAscii(rows: readonly string[], rooms: readonly Room[] = []): DungeonFloor {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const tiles: TileType[] = [];
  for (const row of rows) {
    if (row.length !== width) throw new Error('floorFromAscii: wszystkie wiersze muszą mieć tę samą długość.');
    for (const ch of row) tiles.push(ch === '#' ? TileType.Wall : TileType.Floor);
  }
  const origin: TilePoint = { x: 0, y: 0 };
  return {
    seed: 0,
    width,
    height,
    tiles,
    rooms,
    startRoomId: 0,
    bossRoomId: 0,
    playerSpawn: origin,
    stairs: origin,
  };
}

export function room(id: number, x: number, y: number, width: number, height: number, kind: RoomKind): Room {
  return { id, x, y, width, height, kind };
}

/** Liczba kafli osiągalnych (BFS, 4 kierunki) z punktu startowego. */
export function countReachable(floor: DungeonFloor, from: TilePoint): number {
  const { width, height, tiles } = floor;
  const seen = new Uint8Array(tiles.length);
  const queue: number[] = [from.y * width + from.x];
  seen[queue[0]!] = 1;
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const x = current % width;
    const y = Math.floor(current / width);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (seen[next] || tiles[next] === TileType.Wall) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return queue.length;
}

export function countWalkable(floor: DungeonFloor): number {
  return floor.tiles.filter((t) => t !== TileType.Wall).length;
}

/** Zestaw wygenerowanych pięter do testów właściwości („dla każdego piętra…”). */
export function sampleFloors(floorNumbers: readonly number[], seedsPerFloor: number): DungeonFloor[] {
  const floors: DungeonFloor[] = [];
  for (const floorNumber of floorNumbers) {
    const generator = new DungeonGenerator(getDungeonConfigForFloor(floorNumber));
    for (let i = 1; i <= seedsPerFloor; i++) floors.push(generator.generate(i * 7919 + floorNumber));
  }
  return floors;
}

export const tileCenter = (tile: TilePoint, tileSize: number): { x: number; y: number } => ({
  x: (tile.x + 0.5) * tileSize,
  y: (tile.y + 0.5) * tileSize,
});
