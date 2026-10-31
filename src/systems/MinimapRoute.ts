import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';

/** Kolejność sąsiadów stała — przy remisie trasa wybiera zawsze tę samą drogę (bez migotania). */
const STEPS: readonly TilePoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * Podpowiedź drogi na minimapie (krok 147). Czysta logika: pole odległości od celu (BFS po podłodze,
 * 4 kierunki — bez ścinania rogów) liczone raz na cel, a trasa gracza to schodzenie po malejącej odległości.
 * Kraty i zamknięte schody nie blokują — podpowiedź pokazuje kierunek, nie stan drzwi.
 */
export class MinimapRoute {
  private dist: Int32Array | null = null;
  private goalKey = '';
  private cacheKey = '';
  private cache: readonly TilePoint[] = [];

  constructor(private readonly floor: DungeonFloor) {}

  /** Trasa od kafla gracza (bez niego) do celu, najwyżej `maxSteps` kafli; pusta, gdy celu nie da się osiągnąć. */
  route(from: TilePoint, goal: TilePoint, maxSteps: number): readonly TilePoint[] {
    const goalKey = `${goal.x},${goal.y}`;
    if (goalKey !== this.goalKey) {
      this.goalKey = goalKey;
      this.dist = this.distanceField(goal);
      this.cacheKey = '';
    }
    const key = `${from.x},${from.y},${maxSteps}`;
    if (key === this.cacheKey) return this.cache;
    this.cacheKey = key;
    this.cache = this.walk(from, maxSteps);
    return this.cache;
  }

  private walk(from: TilePoint, maxSteps: number): TilePoint[] {
    const dist = this.dist!;
    const { width, height } = this.floor;
    if (from.x < 0 || from.y < 0 || from.x >= width || from.y >= height) return [];
    let cur = from;
    let d = dist[cur.y * width + cur.x]!;
    if (d < 0) return [];
    const path: TilePoint[] = [];
    while (d > 0 && path.length < maxSteps) {
      let next: TilePoint | null = null;
      for (const step of STEPS) {
        const nx = cur.x + step.x;
        const ny = cur.y + step.y;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (dist[ny * width + nx] === d - 1) {
          next = { x: nx, y: ny };
          break;
        }
      }
      if (!next) break;
      path.push(next);
      cur = next;
      d--;
    }
    return path;
  }

  /** Odległość w krokach od celu dla każdego kafla; -1 = ściana albo kafel nieosiągalny. */
  private distanceField(goal: TilePoint): Int32Array {
    const { width, height, tiles } = this.floor;
    const dist = new Int32Array(width * height).fill(-1);
    if (goal.x < 0 || goal.y < 0 || goal.x >= width || goal.y >= height) return dist;
    const queue = [goal.y * width + goal.x];
    dist[queue[0]!] = 0;
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head]!;
      const x = index % width;
      const y = (index - x) / width;
      for (const step of STEPS) {
        const nx = x + step.x;
        const ny = y + step.y;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (dist[ni] !== -1 || tiles[ni] === TileType.Wall) continue;
        dist[ni] = dist[index]! + 1;
        queue.push(ni);
      }
    }
    return dist;
  }
}

/**
 * Ile trasy pokazać: całą część przez odkryte kafle, a we mgle tylko `fogLead` pierwszych kafli
 * (kierunek, nie plan piętra). Oddaje dla każdego kafla jasność 0..1 — we mgle wygasa.
 */
export function visibleRoute(
  route: readonly TilePoint[],
  isRevealed: (x: number, y: number) => boolean,
  fogLead: number,
): { readonly tile: TilePoint; readonly fade: number }[] {
  const out: { tile: TilePoint; fade: number }[] = [];
  let fogged = 0;
  for (const tile of route) {
    if (isRevealed(tile.x, tile.y)) {
      out.push({ tile, fade: 1 });
      continue;
    }
    fogged++;
    if (fogged > fogLead) break;
    out.push({ tile, fade: 1 - fogged / (fogLead + 1) });
  }
  return out;
}
