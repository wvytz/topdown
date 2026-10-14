import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { CocoonConfig } from '@/systems/Cocoons';

/** Ile losowań kafla na jeden kokon, zanim się poddamy (mały pokój). */
const TRIES_PER_COCOON = 12;

/**
 * Rozmieszcza kokony w zwykłych pokojach (krok 23d): nie w startowym, nie na arenie bossa.
 * Z dala od ścian (nie w przejściach) i od środka pokoju (kapliczka), z odstępem między kokonami.
 */
export function planCocoons(
  floor: DungeonFloor,
  config: Pick<CocoonConfig, 'perRoom' | 'wallMarginTiles' | 'centerClearTiles' | 'minSpacingTiles'>,
  rng: Rng,
): TilePoint[] {
  const cocoons: TilePoint[] = [];
  const m = config.wallMarginTiles;

  for (const room of floor.rooms) {
    if (room.kind !== RoomKind.Normal) continue;
    const count = rng.int(config.perRoom.min, config.perRoom.max);
    const center: TilePoint = { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
    const placed: TilePoint[] = [];

    for (let guard = 0; placed.length < count && guard < count * TRIES_PER_COCOON; guard++) {
      const tile: TilePoint = {
        x: rng.int(room.x + m, room.x + room.width - 1 - m),
        y: rng.int(room.y + m, room.y + room.height - 1 - m),
      };
      if (floor.tiles[tile.y * floor.width + tile.x] !== TileType.Floor) continue;
      if (chebyshev(tile, center) <= config.centerClearTiles) continue;
      if (placed.some((other) => chebyshev(tile, other) < config.minSpacingTiles)) continue;
      placed.push(tile);
    }
    cocoons.push(...placed);
  }
  return cocoons;
}

function chebyshev(a: TilePoint, b: TilePoint): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
