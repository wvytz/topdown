import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import { hasLineOfSight } from '@/dungeon/lineOfSight';

/**
 * Droga bota-partnera po kaflach (krok 149) — czysta logika. BFS w 8 kierunkach bez ścinania rogów muru,
 * potem „naciągnięcie sznurka”: bot idzie do najdalszego punktu drogi, który widzi po prostej.
 */

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const isOpen = (floor: DungeonFloor, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < floor.width && y < floor.height && floor.tiles[y * floor.width + x] !== TileType.Wall;

/** Prosta droga dla ciała o połowie szerokości `halfWidth` (px): środek i dwa boczne odcinki nie przecinają muru. */
export function clearPath(floor: DungeonFloor, from: Vector2, to: Vector2, tileSize: number, halfWidth: number): boolean {
  if (!hasLineOfSight(floor, from, to, tileSize)) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1 || halfWidth <= 0) return true;
  const nx = (-dy / length) * halfWidth;
  const ny = (dx / length) * halfWidth;
  return (
    hasLineOfSight(floor, { x: from.x + nx, y: from.y + ny }, { x: to.x + nx, y: to.y + ny }, tileSize) &&
    hasLineOfSight(floor, { x: from.x - nx, y: from.y - ny }, { x: to.x - nx, y: to.y - ny }, tileSize)
  );
}

/** Kafle od `from` do `to` włącznie (najkrótsza droga) albo null, gdy nie da się dojść. */
export function findTilePath(floor: DungeonFloor, from: TilePoint, to: TilePoint, maxNodes = 4000): TilePoint[] | null {
  if (!isOpen(floor, from.x, from.y) || !isOpen(floor, to.x, to.y)) return null;
  const { width } = floor;
  const start = from.y * width + from.x;
  const goal = to.y * width + to.x;
  const came = new Map<number, number>([[start, -1]]);
  const queue = [start];
  for (let head = 0; head < queue.length && head < maxNodes; head++) {
    const cur = queue[head]!;
    if (cur === goal) break;
    const x = cur % width;
    const y = Math.floor(cur / width);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isOpen(floor, nx, ny)) continue;
      // Po skosie tylko, gdy oba sąsiednie kafle są wolne — inaczej ciało zahaczy o róg.
      if (dx !== 0 && dy !== 0 && (!isOpen(floor, x + dx, y) || !isOpen(floor, x, y + dy))) continue;
      const next = ny * width + nx;
      if (came.has(next)) continue;
      came.set(next, cur);
      queue.push(next);
    }
  }
  if (!came.has(goal)) return null;
  const path: TilePoint[] = [];
  for (let at = goal; at !== -1; at = came.get(at)!) path.push({ x: at % width, y: Math.floor(at / width) });
  return path.reverse();
}

/**
 * Najbliższy punkt (px), do którego bot ma iść, żeby dojść do `target`: sam cel, gdy widać go po prostej,
 * inaczej najdalszy widoczny środek kafla drogi. null — brak drogi.
 */
export function nextWaypoint(floor: DungeonFloor, from: Vector2, target: Vector2, tileSize: number, halfWidth = 0): Vector2 | null {
  if (clearPath(floor, from, target, tileSize, halfWidth)) return target;
  const toTile = (p: Vector2): TilePoint => ({ x: Math.floor(p.x / tileSize), y: Math.floor(p.y / tileSize) });
  const path = findTilePath(floor, toTile(from), toTile(target));
  if (!path || path.length < 2) return path ? target : null;
  const center = (t: TilePoint): Vector2 => ({ x: (t.x + 0.5) * tileSize, y: (t.y + 0.5) * tileSize });
  let best = center(path[1]!);
  for (let i = 2; i < path.length; i++) {
    const point = center(path[i]!);
    if (!clearPath(floor, from, point, tileSize, halfWidth)) break;
    best = point;
  }
  return best;
}
