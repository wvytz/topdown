import type { DungeonFloor } from '@/core/dungeonTypes';
import { RoomKind } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';

export interface AmbushRoomRule {
  /** Najmniejszy dopuszczalny krótszy bok pokoju. */
  readonly minSide: number;
  /** Zwykle wybieramy pokój o krótszym boku co najmniej tyle (krok 49b: więcej miejsca na unik). */
  readonly preferredSide: number;
  /** Szansa, że wybór ograniczy się do pokojów `preferredSide` (gdy są). */
  readonly preferredChance: number;
}

/**
 * Pokój zasadzki (krok 49): losowy zwykły pokój dostaje rodzaj Ambush — planery wrogów, kapliczki, pułapek
 * i urn go pomijają (pusty pokój z przynętą). Zwykle pokój o krótszym boku ≥ `preferredSide`, czasem (albo gdy
 * takiego nie ma) ≥ `minSide`. Null, gdy żaden się nie nadaje.
 */
export function planAmbushRoom(floor: DungeonFloor, rule: AmbushRoomRule, rng: Rng): { readonly floor: DungeonFloor; readonly roomId: number } | null {
  const side = (r: { width: number; height: number }) => Math.min(r.width, r.height);
  const normal = floor.rooms.filter((r) => r.kind === RoomKind.Normal);
  const roomy = normal.filter((r) => side(r) >= rule.preferredSide);
  const preferRoomy = rng.next() < rule.preferredChance;
  const candidates = preferRoomy && roomy.length > 0 ? roomy : normal.filter((r) => side(r) >= rule.minSide);
  if (candidates.length === 0) return null;
  const room = candidates[Math.floor(rng.next() * candidates.length)]!;
  return {
    floor: { ...floor, rooms: floor.rooms.map((r) => (r.id === room.id ? { ...r, kind: RoomKind.Ambush } : r)) },
    roomId: room.id,
  };
}
