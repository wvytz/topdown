import { describe, expect, it } from 'vitest';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { getDungeonConfigForFloor } from '@/config/gameConfig';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { TileType, type DungeonFloor } from '@/core/dungeonTypes';

/**
 * Układ korytarzy (krok 128, ocena właściciela: „równolegle biegnące korytarze” i „mapy-okrążenia”).
 * Miary jak w analizie z DEVLOG: równoległy bieg = dwa pasy korytarza rozdzielone 1–3 kaflami muru na ≥ 6 kafli;
 * pierścień = cykl pokojów bez skrótów obejmujący co najmniej połowę piętra.
 */
const SEEDS = 25;

const roomAt = (f: DungeonFloor, x: number, y: number): number =>
  f.rooms.findIndex((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
const open = (f: DungeonFloor, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < f.width && y < f.height && f.tiles[y * f.width + x] !== TileType.Wall;

function parallelRuns(f: DungeonFloor): number {
  const corridor = (x: number, y: number) => open(f, x, y) && roomAt(f, x, y) < 0;
  let runs = 0;
  for (const horizontal of [true, false]) {
    const lines = horizontal ? f.height : f.width;
    const along = horizontal ? f.width : f.height;
    const at = (a: number, b: number) => (horizontal ? corridor(b, a) : corridor(a, b));
    const wall = (a: number, b: number) => (horizontal ? !open(f, b, a) : !open(f, a, b));
    for (let gap = 1; gap <= 3; gap++) {
      for (let a = 0; a + gap + 1 < lines; a++) {
        let len = 0;
        for (let b = 0; b <= along; b++) {
          let ok = b < along && at(a, b) && at(a + gap + 1, b);
          for (let g = 1; ok && g <= gap; g++) ok = wall(a + g, b);
          if (ok) len++;
          else {
            if (len >= 6) runs++;
            len = 0;
          }
        }
      }
    }
  }
  return runs;
}

/** Graf: pokoje i spójne kawałki korytarzy; największy „czysty” cykl (składowa dwuspójna z E = V) w pokojach. */
function pureRingRooms(f: DungeonFloor): number {
  const comp = new Int32Array(f.width * f.height).fill(-1);
  const edges = new Set<string>();
  let components = 0;
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      if (!open(f, x, y) || roomAt(f, x, y) >= 0 || comp[y * f.width + x]! >= 0) continue;
      const id = components++;
      const stack: Array<[number, number]> = [[x, y]];
      comp[y * f.width + x] = id;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ] as const) {
          if (!open(f, nx, ny)) continue;
          const room = roomAt(f, nx, ny);
          if (room >= 0) edges.add(`c${id}|r${room}`);
          else if (comp[ny * f.width + nx]! < 0) {
            comp[ny * f.width + nx] = id;
            stack.push([nx, ny]);
          }
        }
      }
    }
  }
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const [a, b] = e.split('|') as [string, string];
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  }
  let time = 0;
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  let best = 0;
  const dfs = (u: string, parent: string | null): void => {
    disc.set(u, ++time);
    low.set(u, time);
    for (const v of adj.get(u) ?? []) {
      if (v === parent) continue;
      if (!disc.has(v)) {
        stack.push(`${u}|${v}`);
        dfs(v, u);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (low.get(v)! >= disc.get(u)!) {
          const nodes = new Set<string>();
          let count = 0;
          let e: string;
          do {
            e = stack.pop()!;
            count++;
            for (const n of e.split('|')) nodes.add(n);
          } while (e !== `${u}|${v}`);
          if (count === nodes.size) best = Math.max(best, [...nodes].filter((n) => n.startsWith('r')).length);
        }
      } else if (disc.get(v)! < disc.get(u)!) {
        stack.push(`${u}|${v}`);
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  };
  for (const n of adj.keys()) if (!disc.has(n)) dfs(n, null);
  return best;
}

const floors = Array.from({ length: TOWER_CONFIG.floorsPerLoop }, (_, i) => i + 1).flatMap((floorNumber) => {
  const generator = new DungeonGenerator(getDungeonConfigForFloor(floorNumber));
  return Array.from({ length: SEEDS }, (_, s) => generator.generate(s * 7919 + floorNumber * 13));
});

describe('układ korytarzy (krok 128)', () => {
  it('równoległe korytarze rzadko (przed krokiem 128: na 31% pięter)', () => {
    const withParallel = floors.filter((f) => parallelRuns(f) > 0).length;
    expect(withParallel / floors.length).toBeLessThan(0.1);
  });

  it('piętro nie jest jednym wielkim okrążeniem (przed krokiem 128: 7% pięter)', () => {
    const rings = floors.filter((f) => pureRingRooms(f) >= Math.ceil(f.rooms.length / 2)).length;
    expect(rings / floors.length).toBeLessThan(0.03);
  });

  it('pętle zostają — na większych piętrach średnio co najmniej jedna', () => {
    const big = floors.filter((f) => f.rooms.length >= 11);
    expect(big.length).toBeGreaterThan(20);
    const loops = big.reduce((sum, f) => sum + cyclomatic(f), 0) / big.length;
    expect(loops).toBeGreaterThanOrEqual(1);
  });

  it('każde piętro spójne: z pokoju startowego dojdzie się do każdego pokoju', () => {
    for (const f of floors) {
      const seen = new Uint8Array(f.width * f.height);
      const start = f.rooms[f.startRoomId]!;
      const queue = [[start.x, start.y] as const];
      seen[start.y * f.width + start.x] = 1;
      for (let head = 0; head < queue.length; head++) {
        const [x, y] = queue[head]!;
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ] as const) {
          if (!open(f, nx, ny) || seen[ny * f.width + nx]) continue;
          seen[ny * f.width + nx] = 1;
          queue.push([nx, ny]);
        }
      }
      for (const room of f.rooms) expect(seen[room.y * f.width + room.x], `seed ${f.seed}, pokój ${room.id}`).toBe(1);
    }
  });
});

/** Liczba niezależnych cykli w grafie pokojów i korytarzy (E − V + 1). */
function cyclomatic(f: DungeonFloor): number {
  const comp = new Int32Array(f.width * f.height).fill(-1);
  const edges = new Set<string>();
  let components = 0;
  for (let i = 0; i < comp.length; i++) {
    const x = i % f.width;
    const y = Math.floor(i / f.width);
    if (!open(f, x, y) || roomAt(f, x, y) >= 0 || comp[i]! >= 0) continue;
    const id = components++;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const cur = stack.pop()!;
      const cx = cur % f.width;
      const cy = Math.floor(cur / f.width);
      for (const [nx, ny] of [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ] as const) {
        if (!open(f, nx, ny)) continue;
        const room = roomAt(f, nx, ny);
        const next = ny * f.width + nx;
        if (room >= 0) edges.add(`${id}|${room}`);
        else if (comp[next]! < 0) {
          comp[next] = id;
          stack.push(next);
        }
      }
    }
  }
  return edges.size - (f.rooms.length + components) + 1;
}
