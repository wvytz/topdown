import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { StickyWeb, StickyWebConfig } from '@/systems/StickyWebs';
import { webGap } from '@/systems/StickyWebs';

/** Ile losowań miejsca na jedną pajęczynę, zanim się poddamy (mały pokój). */
const TRIES_PER_WEB = 12;

/**
 * Rozmieszcza lepkie pajęczyny w zwykłych pokojach (krok 23e): nie w startowym, nie na arenie.
 * Cała pajęczyna leży na podłodze pokoju, z dala od ścian i od środka (kapliczka), z przerwą
 * od innych pajęczyn i od kokonów (`avoid`) — obie pułapki naraz byłyby nieczytelne.
 */
export function planStickyWebs(
  floor: DungeonFloor,
  config: Omit<StickyWebConfig, 'slow'>,
  rng: Rng,
  avoid: readonly TilePoint[] = [],
): StickyWeb[] {
  const webs: StickyWeb[] = [];
  const blockers: StickyWeb[] = avoid.map((tile) => ({ tile, size: 1 }));

  for (const room of floor.rooms) {
    if (room.kind !== RoomKind.Normal) continue;
    const count = rng.int(config.perRoom.min, config.perRoom.max);
    const center: StickyWeb = { tile: { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) }, size: 1 };
    let placed = 0;

    for (let guard = 0; placed < count && guard < count * TRIES_PER_WEB; guard++) {
      const size: 1 | 2 = rng.chance(config.largeChance) ? 2 : 1;
      const web = randomWeb(room, size, config.wallMarginTiles, rng);
      if (!web || !onFloor(floor, web)) continue;
      // Przerwa od środka liczona jak od kafla: `centerClearTiles` = tyle kafli wolnych wokół środka.
      if (webGap(web, center) < config.centerClearTiles) continue;
      if ([...webs, ...blockers].some((other) => webGap(web, other) < config.minGapTiles)) continue;
      webs.push(web);
      placed++;
    }
  }
  return webs;
}

function randomWeb(room: Room, size: 1 | 2, margin: number, rng: Rng): StickyWeb | null {
  const maxX = room.x + room.width - margin - size;
  const maxY = room.y + room.height - margin - size;
  if (maxX < room.x + margin || maxY < room.y + margin) return null;
  return { tile: { x: rng.int(room.x + margin, maxX), y: rng.int(room.y + margin, maxY) }, size };
}

function onFloor(floor: DungeonFloor, { tile, size }: StickyWeb): boolean {
  for (let y = tile.y; y < tile.y + size; y++) {
    for (let x = tile.x; x < tile.x + size; x++) {
      if (floor.tiles[y * floor.width + x] !== TileType.Floor) return false;
    }
  }
  return true;
}
