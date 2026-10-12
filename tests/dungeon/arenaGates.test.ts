import { describe, expect, it } from 'vitest';
import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { ArenaGateLock, ArenaGateState, findRoomEntrances, isDeepInsideRoom } from '@/dungeon/arenaGates';
import { roomContainsTile } from '@/dungeon/rooms';
import { countReachable, floorFromAscii, room, sampleFloors } from '../helpers/floors';

// Pokój 5×3 o wnętrzu (2,2)–(6,4); wejścia: korytarz z lewej (1,3) i z dołu (4,5).
const ARENA = room(0, 2, 2, 5, 3, RoomKind.Boss);
const FLOOR = floorFromAscii(
  [
    '#########',
    '#########',
    '##.....##',
    '#......##',
    '##.....##',
    '####.####',
    '####.####',
  ],
  [ARENA],
);

const sortTiles = (tiles: readonly TilePoint[]): TilePoint[] =>
  [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);

/** Kopia piętra z wejściami zamienionymi na ściany (tak działa krata w fizyce). */
function withSealed(floor: DungeonFloor, gates: readonly TilePoint[]): DungeonFloor {
  const tiles = [...floor.tiles];
  for (const gate of gates) tiles[gate.y * floor.width + gate.x] = TileType.Wall;
  return { ...floor, tiles };
}

describe('findRoomEntrances', () => {
  it('znajduje kafle podłogi tuż za obrysem pokoju', () => {
    expect(sortTiles(findRoomEntrances(FLOOR, ARENA))).toEqual([
      { x: 1, y: 3 },
      { x: 4, y: 5 },
    ]);
  });

  it('pokój bez korytarzy nie ma wejść', () => {
    const closed = floorFromAscii(['#####', '#...#', '#####'], [room(0, 1, 1, 3, 1, RoomKind.Boss)]);
    expect(findRoomEntrances(closed, closed.rooms[0]!)).toEqual([]);
  });

  it('obejmuje narożniki pierścienia (przejście po skosie)', () => {
    const corner = floorFromAscii(['.####', '#...#', '#####'], [room(0, 1, 1, 3, 1, RoomKind.Boss)]);
    expect(findRoomEntrances(corner, corner.rooms[0]!)).toEqual([{ x: 0, y: 0 }]);
  });

  it('na wygenerowanych piętrach zamknięcie wejść odcina arenę od startu', () => {
    for (const floor of sampleFloors([1, 2, 3, 5, 8, 10], 40)) {
      const arena = floor.rooms[floor.bossRoomId]!;
      const gates = findRoomEntrances(floor, arena);
      expect(gates.length).toBeGreaterThan(0);
      for (const gate of gates) expect(roomContainsTile(arena, gate)).toBe(false);

      const sealed = withSealed(floor, gates);
      const arenaTiles = arena.width * arena.height;
      expect(countReachable(sealed, floor.stairs)).toBe(arenaTiles);
    }
  });
});

describe('isDeepInsideRoom', () => {
  const big = room(0, 10, 10, 11, 11, RoomKind.Boss);

  it('margines 1 wyklucza skrajne kafle pokoju', () => {
    expect(isDeepInsideRoom(big, { x: 10, y: 15 }, 1)).toBe(false);
    expect(isDeepInsideRoom(big, { x: 11, y: 15 }, 1)).toBe(true);
    expect(isDeepInsideRoom(big, { x: 19, y: 19 }, 1)).toBe(true);
    expect(isDeepInsideRoom(big, { x: 20, y: 19 }, 1)).toBe(false);
  });

  it('margines 0 to zwykła przynależność do pokoju', () => {
    expect(isDeepInsideRoom(big, { x: 10, y: 10 }, 0)).toBe(true);
    expect(isDeepInsideRoom(big, { x: 9, y: 10 }, 0)).toBe(false);
  });
});

describe('ArenaGateLock', () => {
  const arena = room(0, 10, 10, 11, 11, RoomKind.Boss);
  const deep: TilePoint = { x: 15, y: 15 };
  const edge: TilePoint = { x: 10, y: 15 };
  const outside: TilePoint = { x: 5, y: 5 };
  const input = (bossFighting: boolean, playerTile: TilePoint, bossDefeated = false) => ({
    bossFighting,
    bossDefeated,
    playerTile,
  });

  it('nie zamyka krat, dopóki boss śpi', () => {
    const lock = new ArenaGateLock(arena, 1);
    expect(lock.update(input(false, deep))).toBeNull();
    expect(lock.state).toBe(ArenaGateState.Open);
  });

  it('czeka, aż gracz zejdzie z krawędzi areny', () => {
    const lock = new ArenaGateLock(arena, 1);
    expect(lock.update(input(true, edge))).toBeNull();
    expect(lock.update(input(true, outside))).toBeNull();
    expect(lock.update(input(true, deep))).toBe('seal');
    expect(lock.state).toBe(ArenaGateState.Sealed);
  });

  it('zamyka kraty tylko raz', () => {
    const lock = new ArenaGateLock(arena, 1);
    lock.update(input(true, deep));
    expect(lock.update(input(true, deep))).toBeNull();
  });

  it('po zwycięstwie podnosi kraty na stałe', () => {
    const lock = new ArenaGateLock(arena, 1);
    lock.update(input(true, deep));
    expect(lock.update(input(false, deep, true))).toBe('release');
    expect(lock.state).toBe(ArenaGateState.Released);
    expect(lock.update(input(true, deep, true))).toBeNull();
    expect(lock.update(input(true, deep))).toBeNull();
  });

  it('boss pokonany przed zamknięciem (np. debug) nie zamyka krat', () => {
    const lock = new ArenaGateLock(arena, 1);
    expect(lock.update(input(false, outside, true))).toBeNull();
    expect(lock.update(input(true, deep))).toBeNull();
    expect(lock.state).toBe(ArenaGateState.Released);
  });
});
