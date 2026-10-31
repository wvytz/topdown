import { describe, expect, it } from 'vitest';
import type { DungeonFloor } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import { ENEMY_ROUTE } from '@/config/combatConfig';
import { getDungeonConfigForFloor } from '@/config/gameConfig';
import { EnemyRoute } from '@/ai/enemyRoute';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { floorFromAscii } from '../helpers/floors';

const T = 32;
const RADIUS = 11;
const SPEED = 115;

const isWall = (floor: DungeonFloor, tx: number, ty: number): boolean =>
  tx < 0 || ty < 0 || tx >= floor.width || ty >= floor.height || floor.tiles[ty * floor.width + tx] === TileType.Wall;

/** Kwadrat ciała (jak ciało Arcade przy kaflach) nachodzi na mur? */
function hitsWall(floor: DungeonFloor, at: Vector2, half: number): boolean {
  for (let ty = Math.floor((at.y - half) / T); ty <= Math.floor((at.y + half - 0.001) / T); ty++) {
    for (let tx = Math.floor((at.x - half) / T); tx <= Math.floor((at.x + half - 0.001) / T); tx++) if (isWall(floor, tx, ty)) return true;
  }
  return false;
}

/**
 * Uproszczona fizyka Arcade: ruch osobno po osiach, krok zablokowany przez mur przepada (ciało sunie wzdłuż muru,
 * ale wbite prostopadle stoi). Zwraca, czy wróg doszedł do celu w `seconds`.
 */
function walk(floor: DungeonFloor, from: Vector2, goal: Vector2, route: EnemyRoute | null, seconds = 4): boolean {
  let at = { ...from };
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    if (Math.hypot(goal.x - at.x, goal.y - at.y) <= 8) return true;
    const aim = route ? route.next(at, goal, t * 1000) : goal;
    const d = Math.hypot(aim.x - at.x, aim.y - at.y) || 1;
    const nx = { x: at.x + ((aim.x - at.x) / d) * SPEED * dt, y: at.y };
    if (!hitsWall(floor, nx, RADIUS)) at = nx;
    const ny = { x: at.x, y: at.y + ((aim.y - at.y) / d) * SPEED * dt };
    if (!hitsWall(floor, ny, RADIUS)) at = ny;
  }
  return Math.hypot(goal.x - at.x, goal.y - at.y) <= 8;
}

const center = (tx: number, ty: number): Vector2 => ({ x: tx * T + T / 2, y: ty * T + T / 2 });

describe('droga wroga wokół rogów (krok 152)', () => {
  // Pokój 6×4, wejście u góry w kolumnie 2, korytarz w górę i w prawo.
  const floor = floorFromAscii(
    [
      '##########',
      '##.......#',
      '##.#######',
      '#.......##',
      '#.......##',
      '#.......##',
      '#.......##',
      '##########',
    ],
    [{ id: 0, kind: RoomKind.Normal, x: 1, y: 3, width: 7, height: 4 }],
  );

  it('po prostej wróg utyka pod murem, z drogą dochodzi do celu za rogiem', () => {
    const from = center(6, 4);
    const goal = center(6, 1);
    expect(walk(floor, from, goal, null)).toBe(false);
    expect(walk(floor, from, goal, new EnemyRoute(floor, T, RADIUS, ENEMY_ROUTE))).toBe(true);
  });

  it('gdy prosta jest wolna, droga to sam cel (zachowanie jak dotąd)', () => {
    const route = new EnemyRoute(floor, T, RADIUS, ENEMY_ROUTE);
    const goal = center(6, 6);
    expect(route.next(center(2, 4), goal, 0)).toEqual(goal);
  });

  it('prawdziwe piętra: wróg z pokoju dochodzi do kafla 3 pola za wejściem', () => {
    let direct = 0;
    let routed = 0;
    let cases = 0;
    for (const seed of [3, 7, 11, 19]) {
      const level = new DungeonGenerator(getDungeonConfigForFloor(1)).generate(seed);
      for (const room of level.rooms) {
        for (let x = room.x; x < room.x + room.width; x++) {
          const door = { x, y: room.y - 1 };
          const out = { x, y: room.y - 4 };
          if ([0, 1, 2, 3].some((k) => isWall(level, x, room.y - 1 - k))) continue;
          for (const side of [-2, 2]) {
            const start = { x: x + side, y: room.y + 1 };
            if (isWall(level, start.x, start.y) || start.x < room.x || start.x >= room.x + room.width) continue;
            cases++;
            if (walk(level, center(start.x, start.y), center(out.x, out.y), null)) direct++;
            if (walk(level, center(start.x, start.y), center(out.x, out.y), new EnemyRoute(level, T, RADIUS, ENEMY_ROUTE))) routed++;
            void door;
          }
        }
      }
    }
    expect(cases).toBeGreaterThan(5);
    expect(routed).toBe(cases);
    expect(direct).toBeLessThanOrEqual(routed);
  });

  it('prawdziwe piętra: pościg do losowego punktu 3–7 kafli dalej, poza linią prostej', () => {
    let direct = 0;
    let routed = 0;
    let cases = 0;
    for (const seed of [2, 5, 8, 13, 21]) {
      const level = new DungeonGenerator(getDungeonConfigForFloor(1)).generate(seed);
      const open: Vector2[] = [];
      for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) if (!isWall(level, x, y)) open.push({ x, y });
      for (let i = 0; i < open.length; i += 7) {
        const a = open[i]!;
        for (let j = 3; j < open.length; j += 53) {
          const b = open[j]!;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < 3 || dist > 7) continue;
          cases++;
          if (walk(level, center(a.x, a.y), center(b.x, b.y), null)) direct++;
          if (walk(level, center(a.x, a.y), center(b.x, b.y), new EnemyRoute(level, T, RADIUS, ENEMY_ROUTE))) routed++;
        }
      }
    }
    expect(routed).toBeGreaterThan(direct);
  });
});
