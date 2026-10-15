import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { BrazierConfig } from '@/systems/Braziers';

/**
 * Rozmieszcza paleniska Piekła (krok 41b) na środku zwykłych pokojów (nie startowego, nie areny):
 * jedno w środku, a w długim pokoju dwa — na 1/3 i 2/3 dłuższego boku. Pomija pokój z kapliczką
 * (`avoid`) i pokoje za wąskie, by obejść strefę buchnięcia.
 */
export function planBraziers(
  floor: DungeonFloor,
  config: Pick<BrazierConfig, 'roomChance' | 'twoFromLongSide' | 'minShortSide'>,
  rng: Rng,
  avoid: readonly TilePoint[] = [],
): TilePoint[] {
  const braziers: TilePoint[] = [];
  for (const room of floor.rooms) {
    if (room.kind !== RoomKind.Normal) continue;
    // Losujemy zawsze, także dla pomijanych pokojów — rozmieszczenie w jednym pokoju nie zależy od reszty.
    const roll = rng.next();
    if (roll >= config.roomChance) continue;
    if (Math.min(room.width, room.height) < config.minShortSide) continue;
    const inRoom = (t: TilePoint) => t.x >= room.x && t.x < room.x + room.width && t.y >= room.y && t.y < room.y + room.height;
    if (avoid.some(inRoom)) continue;

    const cx = room.x + Math.floor(room.width / 2);
    const cy = room.y + Math.floor(room.height / 2);
    const long = Math.max(room.width, room.height);
    let spots: TilePoint[] = [{ x: cx, y: cy }];
    if (long >= config.twoFromLongSide) {
      spots =
        room.width >= room.height
          ? [1, 2].map((k) => ({ x: room.x + Math.floor((room.width * k) / 3), y: cy }))
          : [1, 2].map((k) => ({ x: cx, y: room.y + Math.floor((room.height * k) / 3) }));
    }
    braziers.push(...spots.filter((t) => floor.tiles[t.y * floor.width + t.x] === TileType.Floor));
  }
  return braziers;
}
