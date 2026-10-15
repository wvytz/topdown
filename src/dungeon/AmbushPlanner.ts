import type { DungeonFloor } from '@/core/dungeonTypes';
import { RoomKind } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';

/**
 * Pokój zasadzki (krok 49): losowy zwykły pokój o krótszym boku ≥ `minSide` dostaje rodzaj Ambush —
 * planery wrogów, kapliczki, pułapek i urn go pomijają (pusty pokój z przynętą). Null, gdy żaden się nie nadaje.
 */
export function planAmbushRoom(floor: DungeonFloor, minSide: number, rng: Rng): { readonly floor: DungeonFloor; readonly roomId: number } | null {
  const candidates = floor.rooms.filter((r) => r.kind === RoomKind.Normal && Math.min(r.width, r.height) >= minSide);
  if (candidates.length === 0) return null;
  const room = candidates[Math.floor(rng.next() * candidates.length)]!;
  return {
    floor: { ...floor, rooms: floor.rooms.map((r) => (r.id === room.id ? { ...r, kind: RoomKind.Ambush } : r)) },
    roomId: room.id,
  };
}
