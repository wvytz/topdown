import { describe, expect, it } from 'vitest';
import { clearPath, findTilePath, nextWaypoint } from '@/ai/botPath';
import { floorFromAscii, tileCenter } from '../helpers/floors';

const T = 32;
// Dwa pokoje połączone korytarzem w dolnym rzędzie.
const FLOOR = floorFromAscii([
  '#########',
  '#...#...#',
  '#...#...#',
  '#.......#',
  '#########',
]);

describe('findTilePath', () => {
  it('omija mur przez korytarz', () => {
    const path = findTilePath(FLOOR, { x: 1, y: 1 }, { x: 7, y: 1 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 1, y: 1 });
    expect(path![path!.length - 1]).toEqual({ x: 7, y: 1 });
    // Przejście pod murem w kolumnie 4 — tylko rzędem 3.
    expect(path!.some((t) => t.x === 4 && t.y === 3)).toBe(true);
  });

  it('nie ścina rogu muru po skosie', () => {
    const path = findTilePath(FLOOR, { x: 3, y: 2 }, { x: 5, y: 2 })!;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      if (a.x !== b.x && a.y !== b.y) {
        expect(FLOOR.tiles[a.y * FLOOR.width + b.x]).not.toBe(0);
        expect(FLOOR.tiles[b.y * FLOOR.width + a.x]).not.toBe(0);
      }
    }
  });

  it('zwraca null dla zamkniętego celu', () => {
    const closed = floorFromAscii(['#####', '#.#.#', '#####']);
    expect(findTilePath(closed, { x: 1, y: 1 }, { x: 3, y: 1 })).toBeNull();
  });
});

describe('nextWaypoint', () => {
  it('cel widoczny po prostej — idzie prosto do celu', () => {
    const to = tileCenter({ x: 3, y: 3 }, T);
    expect(nextWaypoint(FLOOR, tileCenter({ x: 1, y: 1 }, T), to, T, 9)).toEqual(to);
  });

  it('za murem — punkt drogi po swojej stronie, widoczny po prostej', () => {
    const from = tileCenter({ x: 1, y: 1 }, T);
    const point = nextWaypoint(FLOOR, from, tileCenter({ x: 7, y: 1 }, T), T, 9)!;
    expect(point).not.toBeNull();
    expect(clearPath(FLOOR, from, point, T, 9)).toBe(true);
    expect(point.y).toBeGreaterThan(from.y);
  });
});
