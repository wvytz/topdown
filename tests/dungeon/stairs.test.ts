import { describe, expect, it } from 'vitest';
import { isStairsTile, stairsCenter, stairsTiles } from '@/dungeon/stairs';
import { floorFromAscii } from '../helpers/floors';

const FLOOR = floorFromAscii([
  '######',
  '#....#',
  '#.SS.#',
  '#.SS.#',
  '#....#',
  '######',
]);

describe('schody 2×2', () => {
  it('blok to 4 kafle od lewego górnego rogu', () => {
    expect(FLOOR.stairs).toEqual({ x: 2, y: 2 });
    expect(stairsTiles(FLOOR)).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ]);
  });

  it('isStairsTile: wszystkie kafle bloku tak, sąsiedzi nie', () => {
    for (const tile of stairsTiles(FLOOR)) expect(isStairsTile(FLOOR, tile)).toBe(true);
    for (const tile of [{ x: 1, y: 2 }, { x: 4, y: 3 }, { x: 2, y: 1 }, { x: 3, y: 4 }]) {
      expect(isStairsTile(FLOOR, tile)).toBe(false);
    }
  });

  it('środek bloku leży na styku czterech kafli (tu budzi się boss)', () => {
    expect(stairsCenter(FLOOR)).toEqual({ x: 3, y: 3 });
  });
});
