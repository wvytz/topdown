import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { WallDogConfig } from '@/systems/WallDogs';

/** Pies w ścianie (krok 84): kafel muru z rysą i kafel podłogi tuż przed nim, na który pies wypada. */
export interface WallDogSpot {
  readonly wall: TilePoint;
  readonly floorTile: TilePoint;
}

const tileAt = (floor: DungeonFloor, t: TilePoint): TileType | null =>
  t.x < 0 || t.y < 0 || t.x >= floor.width || t.y >= floor.height ? null : (floor.tiles[t.y * floor.width + t.x] ?? null);

/** Kafle muru wzdłuż czterech boków pokoju (bez narożników) i kierunek do wnętrza pokoju. */
function wallCandidates(room: Room): Array<{ wall: TilePoint; inward: TilePoint }> {
  const out: Array<{ wall: TilePoint; inward: TilePoint }> = [];
  for (let x = room.x + 1; x < room.x + room.width - 1; x++) {
    out.push({ wall: { x, y: room.y - 1 }, inward: { x: 0, y: 1 } });
    out.push({ wall: { x, y: room.y + room.height }, inward: { x: 0, y: -1 } });
  }
  for (let y = room.y + 1; y < room.y + room.height - 1; y++) {
    out.push({ wall: { x: room.x - 1, y }, inward: { x: 1, y: 0 } });
    out.push({ wall: { x: room.x + room.width, y }, inward: { x: -1, y: 0 } });
  }
  return out;
}

/**
 * Rozmieszcza psy w ścianach zwykłych pokoi (nie startowy, nie arena, nie za mały): kafel muru ma po obu
 * stronach wzdłuż ściany też mur (nie przy wejściu) i podłogę przed sobą. Najwyżej jeden pies na pokój
 * i `maxPerFloor` na piętro. Kafle z `avoid` (np. spawn) pomijamy. Deterministycznie z RNG.
 */
export function planWallDogs(
  floor: DungeonFloor,
  config: Pick<WallDogConfig, 'roomChance' | 'minShortSide' | 'maxPerFloor'>,
  rng: Rng,
  avoid: readonly TilePoint[] = [],
): WallDogSpot[] {
  const spots: WallDogSpot[] = [];
  for (const room of floor.rooms) {
    if (spots.length >= config.maxPerFloor) break;
    if (room.kind !== RoomKind.Normal || Math.min(room.width, room.height) < config.minShortSide) continue;
    if (rng.next() >= config.roomChance) continue;
    const valid = wallCandidates(room).filter(({ wall, inward }) => {
      const along = inward.x === 0 ? { x: 1, y: 0 } : { x: 0, y: 1 };
      const floorTile = { x: wall.x + inward.x, y: wall.y + inward.y };
      return (
        tileAt(floor, wall) === TileType.Wall &&
        tileAt(floor, { x: wall.x + along.x, y: wall.y + along.y }) === TileType.Wall &&
        tileAt(floor, { x: wall.x - along.x, y: wall.y - along.y }) === TileType.Wall &&
        tileAt(floor, floorTile) === TileType.Floor &&
        !avoid.some((a) => Math.max(Math.abs(a.x - floorTile.x), Math.abs(a.y - floorTile.y)) <= 2)
      );
    });
    if (valid.length === 0) continue;
    const pick = valid[rng.int(0, valid.length - 1)]!;
    spots.push({ wall: pick.wall, floorTile: { x: pick.wall.x + pick.inward.x, y: pick.wall.y + pick.inward.y } });
  }
  return spots;
}
