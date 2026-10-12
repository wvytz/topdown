import { describe, expect, it } from 'vitest';
import { hasLineOfSight } from '@/dungeon/lineOfSight';
import { floorFromAscii, tileCenter } from '../helpers/floors';

const T = 32;
const FLOOR = floorFromAscii([
  '#########',
  '#.......#',
  '#...#...#',
  '#.......#',
  '#########',
]);

describe('hasLineOfSight', () => {
  it('widzi w otwartej przestrzeni', () => {
    expect(hasLineOfSight(FLOOR, tileCenter({ x: 1, y: 1 }, T), tileCenter({ x: 7, y: 1 }, T), T)).toBe(true);
    expect(hasLineOfSight(FLOOR, tileCenter({ x: 1, y: 1 }, T), tileCenter({ x: 3, y: 3 }, T), T)).toBe(true);
  });

  it('ukośna linia przecinająca ścianę jest zablokowana', () => {
    // Odcinek (1,3)→(7,1) przechodzi przez kafel (4,2).
    expect(hasLineOfSight(FLOOR, tileCenter({ x: 1, y: 3 }, T), tileCenter({ x: 7, y: 1 }, T), T)).toBe(false);
  });

  it('kolumna ściany zasłania widok', () => {
    expect(hasLineOfSight(FLOOR, tileCenter({ x: 2, y: 2 }, T), tileCenter({ x: 6, y: 2 }, T), T)).toBe(false);
  });

  it('jest symetryczna', () => {
    const a = tileCenter({ x: 2, y: 2 }, T);
    const b = tileCenter({ x: 6, y: 2 }, T);
    expect(hasLineOfSight(FLOOR, a, b, T)).toBe(hasLineOfSight(FLOOR, b, a, T));
  });

  it('punkt wewnątrz ściany lub poza mapą nie ma linii wzroku', () => {
    expect(hasLineOfSight(FLOOR, tileCenter({ x: 0, y: 0 }, T), tileCenter({ x: 2, y: 1 }, T), T)).toBe(false);
    expect(hasLineOfSight(FLOOR, { x: -10, y: 40 }, tileCenter({ x: 2, y: 1 }, T), T)).toBe(false);
  });

  it('ten sam punkt widzi sam siebie', () => {
    const p = tileCenter({ x: 3, y: 3 }, T);
    expect(hasLineOfSight(FLOOR, p, p, T)).toBe(true);
  });
});
