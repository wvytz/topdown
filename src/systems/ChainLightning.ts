import type { DungeonFloor, Room } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import { hasLineOfSight } from '@/dungeon/lineOfSight';

/**
 * Łańcuch pioruna (krok 150, Elektryczna strzała i Iskrownik): z punktu `from` piorun skacze kolejno
 * do najbliższego jeszcze nietrafionego celu w zasięgu `range` od poprzedniego. Czysta logika.
 */
export function chainTargets<T extends Vector2>(
  from: Vector2,
  targets: readonly T[],
  count: number,
  range: number,
  exclude: (target: T) => boolean = () => false,
  /** Krok 151: czy piorun może przeskoczyć z `from` do `to` (linia wzroku, pokój bohatera). */
  canLink: (from: Vector2, to: T) => boolean = () => true,
): T[] {
  const chain: T[] = [];
  const left = targets.filter((target) => !exclude(target));
  let at = from;
  while (chain.length < count) {
    let best: T | null = null;
    let bestDistance = range;
    for (const target of left) {
      if (chain.includes(target)) continue;
      const d = Math.hypot(target.x - at.x, target.y - at.y);
      if (d <= bestDistance && canLink(at, target)) {
        best = target;
        bestDistance = d;
      }
    }
    if (!best) break;
    chain.push(best);
    at = best;
  }
  return chain;
}

/** Pokój, w którego wnętrzu leży punkt (px); `null` — korytarz. */
export function roomAtPoint(rooms: readonly Room[], at: Vector2, tileSize: number): Room | null {
  const tx = Math.floor(at.x / tileSize);
  const ty = Math.floor(at.y / tileSize);
  return rooms.find((room) => tx >= room.x && tx < room.x + room.width && ty >= room.y && ty < room.y + room.height) ?? null;
}

/**
 * Krok 151 (`#decyzja` właściciela po przeglądzie buildu): piorun nie przechodzi przez ściany, a gdy bohater
 * stoi w pokoju — nie wychodzi poza ten pokój (wróg w sąsiednim pokoju albo czekający za kratą zasadzki
 * nie dostaje darmowych trafień). W korytarzu wystarcza linia wzroku.
 */
export function sparkLinkRule(floor: Pick<DungeonFloor, 'width' | 'height' | 'tiles' | 'rooms'>, hero: Vector2, tileSize: number): (from: Vector2, to: Vector2) => boolean {
  const room = roomAtPoint(floor.rooms, hero, tileSize);
  return (from, to) => {
    if (room && roomAtPoint([room], to, tileSize) === null) return false;
    return hasLineOfSight(floor, from, to, tileSize);
  };
}
