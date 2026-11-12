import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { StairsCorner, arenaCenter, isStairsTile, planStairs, runStairsCorner, stairsTiles } from '@/dungeon/stairs';
import { floorFromAscii } from '../helpers/floors';

const FLOOR = floorFromAscii([
  '#######',
  '#.....#',
  '#.SSS.#',
  '#.SSS.#',
  '#.SSS.#',
  '#.....#',
  '#######',
]);

describe('klatka schodowa 3×3 (krok 187)', () => {
  it('blok to 9 kafli od lewego górnego rogu', () => {
    expect(FLOOR.stairs).toEqual({ x: 2, y: 2 });
    expect(stairsTiles(FLOOR)).toHaveLength(9);
    expect(stairsTiles(FLOOR)[0]).toEqual({ x: 2, y: 2 });
    expect(stairsTiles(FLOOR)[8]).toEqual({ x: 4, y: 4 });
  });

  it('isStairsTile: wszystkie kafle bloku tak, sąsiedzi nie', () => {
    for (const tile of stairsTiles(FLOOR)) expect(isStairsTile(FLOOR, tile)).toBe(true);
    for (const tile of [{ x: 1, y: 2 }, { x: 5, y: 3 }, { x: 2, y: 1 }, { x: 4, y: 5 }]) {
      expect(isStairsTile(FLOOR, tile)).toBe(false);
    }
  });

  it('arenaCenter: środek komnaty w kaflach (tu staje i budzi się boss)', () => {
    expect(arenaCenter({ id: 0, kind: RoomKind.Boss, x: 2, y: 4, width: 11, height: 12 })).toEqual({ x: 7.5, y: 10 });
  });
});

describe('planStairs (krok 75)', () => {
  const ARENA = { id: 0, kind: RoomKind.Boss, x: 1, y: 1, width: 11, height: 11 } as const;
  /** Arena 11×11 w murze; wejście `door` to jeden kafel podłogi tuż za obrysem. */
  const floorWithDoor = (door: { x: number; y: number }) => {
    const width = 13;
    const tiles = new Array<TileType>(width * width).fill(TileType.Wall);
    for (let y = 1; y <= 11; y++) for (let x = 1; x <= 11; x++) tiles[y * width + x] = TileType.Floor;
    tiles[door.y * width + door.x] = TileType.Floor;
    return { width, height: width, tiles };
  };

  it('wybiera narożnik najdalszy od wejścia, z odstępem od ścian', () => {
    // Wejście od zachodu przy północnej ścianie → schody w południowo-wschodnim narożniku.
    expect(planStairs(floorWithDoor({ x: 0, y: 2 }), ARENA)).toEqual({ x: 8, y: 8 });
    // Wejście od południa przy zachodniej ścianie → schody w północno-wschodnim.
    expect(planStairs(floorWithDoor({ x: 2, y: 12 }), ARENA)).toEqual({ x: 8, y: 2 });
  });

  it('krok 187: narożnik runu ma pierwszeństwo, chyba że leży przy wejściu', () => {
    const door = floorWithDoor({ x: 0, y: 2 }); // wejście przy NW
    expect(planStairs(door, ARENA, StairsCorner.SouthWest)).toEqual({ x: 2, y: 8 });
    expect(planStairs(door, ARENA, StairsCorner.NorthEast)).toEqual({ x: 8, y: 2 });
    // NW tuż przy wejściu — odpada, zostaje narożnik najdalszy od wejść.
    expect(planStairs(door, ARENA, StairsCorner.NorthWest)).toEqual({ x: 8, y: 8 });
  });

  it('krok 187: narożnik runu jest stały dla seeda i różny między runami', () => {
    expect(runStairsCorner(42)).toBe(runStairsCorner(42));
    const seen = new Set(Array.from({ length: 40 }, (_, i) => runStairsCorner(i + 1)));
    expect(seen.size).toBe(4);
  });
});
