import type { Room, TilePoint } from '@/core/dungeonTypes';

export function roomContainsTile(room: Room, tile: TilePoint): boolean {
  return tile.x >= room.x && tile.x < room.x + room.width && tile.y >= room.y && tile.y < room.y + room.height;
}
