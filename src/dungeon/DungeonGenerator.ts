import type {
  DungeonFloor,
  DungeonGeneratorConfig,
  Room,
  TilePoint,
} from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import { createRng, deriveSeed } from '@/core/random';
import { STAIRS_SIZE } from '@/config/gameConfig';
import { planStairs } from '@/dungeon/stairs';
import { checkBossRoomAtEnd } from '@/dungeon/bossRoomRule';

const BOSS_ROOM_INDEX = 0;

/** Prób ułożenia piętra z areną na końcu (każda z własnym RNG z seeda piętra). */
const BOSS_AT_END_ATTEMPTS = 12;

/** Co nie może stać na drodze korytarza: (x, y) to lewy górny róg „pędzla”. */
type Blocked = (x: number, y: number) => boolean;

interface RoomRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Generuje piętro: losowo rozmieszczone pokoje połączone korytarzami.
 * Połączenia = minimalne drzewo rozpinające (gwarantuje spójność) + kilka dodatkowych pętli.
 * Od kroku 128 korytarz to najtańsza droga (proste odcinki, łączenie w skrzyżowania, bez biegu tuż obok cudzej
 * podłogi), a pętle to lokalne skróty — bez równoległych korytarzy i bez piętra-okrążenia (ocena właściciela).
 * Komnata bossa to duży pokój umieszczany jako pierwszy; start to pokój najdalszy od niej (po ścieżce).
 * Z `bossRoomAtEnd` (krok 45) arena leży na końcu piętra: korytarze reszty piętra ją omijają, arena ma jedno
 * połączenie z resztą i czasem jeden ślepy pokój końcowy za sobą (`checkBossRoomAtEnd`).
 * Czysta logika — bez Phasera.
 */
export class DungeonGenerator {
  constructor(private readonly config: DungeonGeneratorConfig) {}

  generate(seed: number): DungeonFloor {
    if (this.config.bossRoomAtEnd) {
      for (let attempt = 0; attempt < BOSS_AT_END_ATTEMPTS; attempt++) {
        const floor = this.build(seed, createRng(attempt === 0 ? seed : deriveSeed(seed, attempt)), true);
        if (floor && checkBossRoomAtEnd(floor).ok) return floor;
      }
    }
    // Piętro bez reguły (piętro 1) albo — awaryjnie — gdy żadna próba się nie udała.
    return this.build(seed, createRng(seed), false)!;
  }

  private build(seed: number, rng: Rng, bossAtEnd: boolean): DungeonFloor | null {
    const { widthTiles: width, heightTiles: height } = this.config;
    const tiles: TileType[] = new Array<TileType>(width * height).fill(TileType.Wall);

    const rects = this.placeRooms(rng);
    if (rects.length < 2) {
      throw new Error(`DungeonGenerator: udało się umieścić tylko ${rects.length} pokój(e) — zwiększ mapę lub zmniejsz pokoje.`);
    }

    for (const rect of rects) this.carveRect(tiles, rect);
    const bossIndex = BOSS_ROOM_INDEX;
    let endIndex: number | null = null;
    if (bossAtEnd) {
      const end = this.connectWithBossAtEnd(tiles, rects, rng);
      if (end === undefined) return null;
      endIndex = end;
    } else {
      this.connectRooms(tiles, rects, rng);
    }

    // Arena bossa to zawsze pierwszy (duży) pokój; start = pokój najdalszy od niej po ścieżce (nie pokój końcowy).
    const startIndex = this.findFarthestRoom(tiles, rects, bossIndex, endIndex);

    const rooms: Room[] = rects.map((rect, id) => ({
      ...rect,
      id,
      kind: id === startIndex ? RoomKind.Start : id === bossIndex ? RoomKind.Boss : id === endIndex ? RoomKind.Secret : RoomKind.Normal,
    }));

    // Schody STAIRS_SIZE × STAIRS_SIZE w narożniku areny najdalszym od wejść (krok 75); `stairs` to lewy górny róg bloku.
    const stairs = planStairs({ width, height, tiles }, rooms[bossIndex]!);
    for (let dy = 0; dy < STAIRS_SIZE; dy++) {
      for (let dx = 0; dx < STAIRS_SIZE; dx++) tiles[(stairs.y + dy) * width + stairs.x + dx] = TileType.StairsLocked;
    }

    return {
      seed,
      width,
      height,
      tiles,
      rooms,
      startRoomId: startIndex,
      bossRoomId: bossIndex,
      playerSpawn: roomCenter(rects[startIndex]!),
      stairs,
      ...(endIndex !== null && { endRoomId: endIndex }),
    };
  }

  /**
   * Połączenia z areną na końcu (krok 45). Zwraca indeks pokoju końcowego, null bez niego,
   * undefined, gdy któregoś korytarza nie da się poprowadzić (próba odrzucona).
   */
  private connectWithBossAtEnd(tiles: TileType[], rects: readonly RoomRect[], rng: Rng): number | null | undefined {
    const boss = rects[BOSS_ROOM_INDEX]!;
    const byDistance = rects
      .map((_, i) => i)
      .filter((i) => i !== BOSS_ROOM_INDEX)
      .sort((a, b) => centerDistanceSq(boss, rects[a]!) - centerDistanceSq(boss, rects[b]!));
    // Pokój końcowy (opcjonalny): najbliższy arenie; reszta piętra musi mieć co najmniej dwa pokoje.
    const end = byDistance.length >= 3 && rng.chance(this.config.endRoomChance) ? byDistance[0]! : null;
    const main = byDistance.filter((i) => i !== end);
    const near = (rect: RoomRect, margin: number): Blocked => {
      const cw = this.config.corridorWidth;
      return (x, y) =>
        x + cw - 1 >= rect.x - margin && x <= rect.x + rect.width - 1 + margin && y + cw - 1 >= rect.y - margin && y <= rect.y + rect.height - 1 + margin;
    };
    const avoidBoss = near(boss, 1);
    const avoidEnd: Blocked = end === null ? () => false : near(rects[end]!, 1);

    // Reszta piętra: drzewo rozpinające (Prim) i pętle — bez dotykania areny i pokoju końcowego.
    const blockedMain: Blocked = (x, y) => avoidBoss(x, y) || avoidEnd(x, y);
    const links = new RoomLinks();
    if (!this.connectTree(tiles, rects, main, links, blockedMain)) return undefined;
    this.addLoops(tiles, rects, main, links, rng, blockedMain);

    // Jedno wejście na arenę: z najbliższego pokoju reszty piętra.
    if (!this.carveRoute(tiles, rects, BOSS_ROOM_INDEX, main[0]!, avoidEnd, links)) return undefined;
    if (end === null) return null;

    // Korytarz do pokoju końcowego: nie styka się z niczym poza areną i tym pokojem.
    const { widthTiles: width, corridorWidth: cw } = this.config;
    const endRect = rects[end]!;
    const own = (x: number, y: number) => inRect(boss, x, y) || inRect(endRect, x, y);
    const touchesOther: Blocked = (x, y) => {
      for (let dy = -1; dy <= cw; dy++) {
        for (let dx = -1; dx <= cw; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tiles[ty * width + tx] === TileType.Floor && !own(tx, ty)) return true;
        }
      }
      return false;
    };
    if (!this.carveRouted(tiles, roomCenter(boss), roomCenter(endRect), rng, touchesOther)) return undefined;
    return end;
  }

  /**
   * Korytarz z omijaniem przeszkód: najpierw jedno z dwóch „L” (jak zwykle), a gdy oba zahaczają o przeszkodę —
   * najkrótsza droga (BFS) po pozycjach pędzla. Zwraca false, gdy drogi nie ma.
   */
  private carveRouted(tiles: TileType[], from: TilePoint, to: TilePoint, rng: Rng, blocked: Blocked): boolean {
    const first = rng.chance(0.5);
    for (const horizontalFirst of [first, !first]) {
      const corner: TilePoint = horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
      const path = [...linePoints(from, corner), ...linePoints(corner, to)];
      if (path.every((p) => !blocked(p.x, p.y))) {
        for (const p of path) this.carveBrush(tiles, p.x, p.y);
        return true;
      }
    }
    const path = this.findPath(from, to, blocked);
    if (!path) return false;
    for (const p of path) this.carveBrush(tiles, p.x, p.y);
    return true;
  }

  private findPath(from: TilePoint, to: TilePoint, blocked: Blocked): TilePoint[] | null {
    const { widthTiles: width, heightTiles: height, corridorWidth: cw } = this.config;
    const prev = new Int32Array(width * height).fill(-2);
    const startKey = from.y * width + from.x;
    prev[startKey] = -1;
    const queue = [startKey];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head]!;
      const cx = cur % width;
      const cy = Math.floor(cur / width);
      if (cx === to.x && cy === to.y) {
        const path: TilePoint[] = [];
        for (let k = cur; k !== -1; k = prev[k]!) path.push({ x: k % width, y: Math.floor(k / width) });
        return path.reverse();
      }
      for (const [nx, ny] of [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ] as const) {
        if (nx < 1 || ny < 1 || nx + cw > width - 1 || ny + cw > height - 1) continue;
        const next = ny * width + nx;
        if (prev[next] !== -2 || blocked(nx, ny)) continue;
        prev[next] = cur;
        queue.push(next);
      }
    }
    return null;
  }

  private placeRooms(rng: Rng): RoomRect[] {
    const { widthTiles, heightTiles, roomCount, roomSize, bossRoomSize, roomPadding, maxPlacementAttempts } =
      this.config;
    const target = rng.int(roomCount.min, roomCount.max);
    const rects: RoomRect[] = [];

    for (let attempt = 0; attempt < maxPlacementAttempts && rects.length < target; attempt++) {
      // Pierwszy umieszczany pokój to arena bossa (indeks BOSS_ROOM_INDEX).
      const size = rects.length === BOSS_ROOM_INDEX ? bossRoomSize : roomSize;
      const roomWidth = rng.int(size.min, size.max);
      const roomHeight = rng.int(size.min, size.max);
      // Zostawiamy ramkę ścian o grubości 1 kafla wokół całej mapy.
      const maxX = widthTiles - 1 - roomWidth;
      const maxY = heightTiles - 1 - roomHeight;
      if (maxX < 1 || maxY < 1) continue;

      const candidate: RoomRect = {
        x: rng.int(1, maxX),
        y: rng.int(1, maxY),
        width: roomWidth,
        height: roomHeight,
      };
      if (!rects.some((other) => rectsOverlap(candidate, other, roomPadding))) {
        rects.push(candidate);
      }
    }
    return rects;
  }

  private connectRooms(tiles: TileType[], rects: readonly RoomRect[], rng: Rng): void {
    const all = rects.map((_, i) => i);
    const links = new RoomLinks();
    this.connectTree(tiles, rects, all, links, () => false);
    this.addLoops(tiles, rects, all, links, rng, () => false);
  }

  /** Drzewo rozpinające (Prim na odległościach środków) — każdy korytarz omija istniejące równolegle. */
  private connectTree(tiles: TileType[], rects: readonly RoomRect[], nodes: readonly number[], links: RoomLinks, blocked: Blocked): boolean {
    const connected = new Set<number>([nodes[0]!]);
    while (connected.size < nodes.length) {
      let bestFrom = -1;
      let bestTo = -1;
      let bestDistance = Infinity;
      for (const from of connected) {
        for (const to of nodes) {
          if (connected.has(to)) continue;
          const distance = centerDistanceSq(rects[from]!, rects[to]!);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestFrom = from;
            bestTo = to;
          }
        }
      }
      if (!this.carveRoute(tiles, rects, bestFrom, bestTo, blocked, links)) return false;
      connected.add(bestTo);
    }
    return true;
  }

  /**
   * Pętle (krok 128): zamiast korytarzy między losowymi pokojami — skróty między pokojami bliskimi w przestrzeni,
   * ale dalekimi w drodze. Pętla obejmuje najwyżej `loopMaxRoomsRatio` pokojów (bez „okrążenia całego piętra”)
   * i nie dubluje istniejącego połączenia (bez równoległych korytarzy do tego samego pokoju).
   */
  private addLoops(tiles: TileType[], rects: readonly RoomRect[], nodes: readonly number[], links: RoomLinks, rng: Rng, blocked: Blocked): void {
    const wanted = Math.floor(nodes.length * this.config.extraConnectionRatio);
    if (wanted <= 0) return;
    const { loops } = this.config.routing;
    const maxRing = Math.max(loops.minRooms, Math.floor(nodes.length * loops.maxRoomsRatio));
    const candidates: Array<{ a: number; b: number; score: number }> = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        candidates.push({ a, b, score: Math.sqrt(centerDistanceSq(rects[a]!, rects[b]!)) * (1 - loops.jitter / 2 + rng.next() * loops.jitter) });
      }
    }
    candidates.sort((p, q) => p.score - q.score);
    let added = 0;
    for (const { a, b } of candidates) {
      if (added >= wanted) break;
      const ring = links.pathRooms(a, b);
      if (ring === null || ring < loops.minRooms || ring > maxRing) continue;
      if (this.carveRoute(tiles, rects, a, b, blocked, links, true)) added++;
    }
  }

  /** Korytarz między środkami pokojów `a` i `b` po najtańszej drodze; zapisuje, przez które pokoje przeszedł. */
  private carveRoute(tiles: TileType[], rects: readonly RoomRect[], a: number, b: number, blocked: Blocked, links: RoomLinks, loop = false): boolean {
    const { routing } = this.config;
    const path = this.route(tiles, a, b, rects, blocked, loop ? routing.loops.reuseCost : routing.reuseCost);
    if (!path) return false;
    // Pętla musi być nowym korytarzem, a nie przejściem po starych.
    if (loop) {
      const fresh = path.filter((p) => tiles[p.y * this.config.widthTiles + p.x] === TileType.Wall).length;
      if (fresh < path.length * routing.loops.minFreshRatio) return false;
    }
    let last = -1;
    for (const p of path) {
      this.carveBrush(tiles, p.x, p.y);
      const room = rects.findIndex((r) => inRect(r, p.x, p.y));
      if (room >= 0 && room !== last) {
        if (last >= 0) links.add(last, room);
        last = room;
      }
    }
    return true;
  }

  /**
   * Najtańsza droga pędzla (Dijkstra ze stanem kierunku): krok 1, zakręt drożej (korytarze proste, jak dawne „L”),
   * wejście w istniejącą podłogę tanio (korytarze łączą się w skrzyżowania), a krok tuż obok cudzej podłogi drogo —
   * dlatego nowy korytarz nie biegnie wzdłuż starego ani nie ociera się o ściany innych pokojów.
   */
  private route(tiles: readonly TileType[], a: number, b: number, rects: readonly RoomRect[], blocked: Blocked, reuseCost: number): TilePoint[] | null {
    const { widthTiles: width, heightTiles: height, corridorWidth: cw } = this.config;
    const from = roomCenter(rects[a]!);
    const to = roomCenter(rects[b]!);
    const { turnCost, hugCost } = this.config.routing;
    const near = this.nearMask(tiles);
    const cellCost = new Float32Array(width * height).fill(-1);
    const costAt = (x: number, y: number): number => {
      const key = y * width + x;
      const cached = cellCost[key]!;
      if (cached >= 0) return cached;
      let allFloor = true;
      let hugs = false;
      for (let dy = 0; dy < cw; dy++) {
        for (let dx = 0; dx < cw; dx++) {
          const t = (y + dy) * width + x + dx;
          if (tiles[t] === TileType.Wall) {
            allFloor = false;
            if (near[t]) hugs = true;
          }
        }
      }
      const cost = allFloor ? reuseCost : 1 + (hugs ? hugCost : 0);
      cellCost[key] = cost;
      return cost;
    };
    const DIRS = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    const states = width * height * 4;
    const dist = new Float64Array(states).fill(Infinity);
    const prev = new Int32Array(states).fill(-1);
    const heap = new MinHeap();
    for (let d = 0; d < 4; d++) {
      const s = (from.y * width + from.x) * 4 + d;
      dist[s] = 0;
      heap.push(s, 0);
    }
    let goal = -1;
    while (heap.size > 0) {
      const [s, cost] = heap.pop();
      if (cost > dist[s]!) continue;
      const cell = s >> 2;
      const dir = s & 3;
      const cx = cell % width;
      const cy = Math.floor(cell / width);
      if (cx === to.x && cy === to.y) {
        goal = s;
        break;
      }
      for (let d = 0; d < 4; d++) {
        const nx = cx + DIRS[d]![0];
        const ny = cy + DIRS[d]![1];
        if (nx < 1 || ny < 1 || nx + cw > width - 1 || ny + cw > height - 1) continue;
        if (blocked(nx, ny)) continue;
        const next = (ny * width + nx) * 4 + d;
        const turn = cost === 0 || d === dir ? 0 : turnCost;
        const total = cost + costAt(nx, ny) + turn;
        if (total < dist[next]!) {
          dist[next] = total;
          prev[next] = s;
          heap.push(next, total);
        }
      }
    }
    if (goal < 0) return null;
    const path: TilePoint[] = [];
    for (let s = goal; s !== -1; s = prev[s]!) {
      const cell = s >> 2;
      path.push({ x: cell % width, y: Math.floor(cell / width) });
    }
    return path.reverse();
  }

  /** Kafle muru w odległości 1..`routing.hugDistance` od podłogi. */
  private nearMask(tiles: readonly TileType[]): Uint8Array {
    const { hugDistance } = this.config.routing;
    const { widthTiles: width, heightTiles: height } = this.config;
    const dist = new Int8Array(width * height).fill(-1);
    const queue: number[] = [];
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === TileType.Wall) continue;
      dist[i] = 0;
      queue.push(i);
    }
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head]!;
      if (dist[cur]! >= hugDistance) continue;
      const cx = cur % width;
      const cy = Math.floor(cur / width);
      for (const [nx, ny] of [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (dist[next] !== -1) continue;
        dist[next] = dist[cur]! + 1;
        queue.push(next);
      }
    }
    const near = new Uint8Array(width * height);
    for (let i = 0; i < near.length; i++) near[i] = dist[i]! > 0 ? 1 : 0;
    return near;
  }

  private carveBrush(tiles: TileType[], x: number, y: number): void {
    const { widthTiles, heightTiles, corridorWidth } = this.config;
    for (let dy = 0; dy < corridorWidth; dy++) {
      for (let dx = 0; dx < corridorWidth; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx >= 1 && ty >= 1 && tx < widthTiles - 1 && ty < heightTiles - 1) {
          tiles[ty * widthTiles + tx] = TileType.Floor;
        }
      }
    }
  }

  private carveRect(tiles: TileType[], rect: RoomRect): void {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        tiles[y * this.config.widthTiles + x] = TileType.Floor;
      }
    }
  }

  /** Indeks pokoju, którego środek jest najdalej (w krokach BFS) od środka pokoju `fromIndex` (bez `skip`). */
  private findFarthestRoom(tiles: readonly TileType[], rects: readonly RoomRect[], fromIndex: number, skip: number | null = null): number {
    const distances = this.walkDistances(tiles, roomCenter(rects[fromIndex]!));
    let farthest = fromIndex;
    let farthestDistance = -1;
    rects.forEach((rect, index) => {
      if (index === skip) return;
      const center = roomCenter(rect);
      const distance = distances[center.y * this.config.widthTiles + center.x] ?? -1;
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = index;
      }
    });
    return farthest;
  }

  private walkDistances(tiles: readonly TileType[], origin: TilePoint): Int32Array {
    const { widthTiles: width, heightTiles: height } = this.config;
    const distances = new Int32Array(width * height).fill(-1);
    const queue: number[] = [origin.y * width + origin.x];
    distances[queue[0]!] = 0;

    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]!;
      const cx = current % width;
      const cy = Math.floor(current / width);
      const neighbours: ReadonlyArray<readonly [number, number]> = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];
      for (const [nx, ny] of neighbours) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (distances[next] !== -1 || tiles[next] === TileType.Wall) continue;
        distances[next] = distances[current]! + 1;
        queue.push(next);
      }
    }
    return distances;
  }
}

function roomCenter(rect: RoomRect): TilePoint {
  return {
    x: rect.x + Math.floor(rect.width / 2),
    y: rect.y + Math.floor(rect.height / 2),
  };
}

function inRect(rect: RoomRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/** Punkty odcinka poziomego albo pionowego (z oboma końcami). */
function linePoints(from: TilePoint, to: TilePoint): TilePoint[] {
  const stepX = Math.sign(to.x - from.x);
  const stepY = Math.sign(to.y - from.y);
  const points: TilePoint[] = [];
  for (let x = from.x, y = from.y; ; x += stepX, y += stepY) {
    points.push({ x, y });
    if (x === to.x && y === to.y) return points;
  }
}

function centerDistanceSq(a: RoomRect, b: RoomRect): number {
  const ca = roomCenter(a);
  const cb = roomCenter(b);
  return (ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2;
}

function rectsOverlap(a: RoomRect, b: RoomRect, padding: number): boolean {
  return (
    a.x - padding < b.x + b.width &&
    a.x + a.width + padding > b.x &&
    a.y - padding < b.y + b.height &&
    a.y + a.height + padding > b.y
  );
}

/** Połączenia pokojów (graf nieskierowany) — do oceny, jak dużą pętlę zamknie nowy korytarz. */
class RoomLinks {
  private readonly adj = new Map<number, Set<number>>();

  add(a: number, b: number): void {
    (this.adj.get(a) ?? this.adj.set(a, new Set()).get(a)!).add(b);
    (this.adj.get(b) ?? this.adj.set(b, new Set()).get(b)!).add(a);
  }

  /** Liczba pokojów na najkrótszej drodze z `a` do `b` (z oboma końcami); null, gdy nie są połączone. */
  pathRooms(a: number, b: number): number | null {
    const depth = new Map<number, number>([[a, 1]]);
    const queue = [a];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head]!;
      if (cur === b) return depth.get(cur)!;
      for (const next of this.adj.get(cur) ?? []) {
        if (depth.has(next)) continue;
        depth.set(next, depth.get(cur)! + 1);
        queue.push(next);
      }
    }
    return null;
  }
}

/** Kopiec binarny (stan, koszt) dla Dijkstry. */
class MinHeap {
  private readonly keys: number[] = [];
  private readonly costs: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, cost: number): void {
    const { keys, costs } = this;
    let i = keys.length;
    keys.push(key);
    costs.push(cost);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (costs[parent]! <= cost) break;
      keys[i] = keys[parent]!;
      costs[i] = costs[parent]!;
      i = parent;
    }
    keys[i] = key;
    costs[i] = cost;
  }

  pop(): [number, number] {
    const { keys, costs } = this;
    const top: [number, number] = [keys[0]!, costs[0]!];
    const lastKey = keys.pop()!;
    const lastCost = costs.pop()!;
    if (keys.length > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mc = lastCost;
        if (l < keys.length && costs[l]! < mc) {
          m = l;
          mc = costs[l]!;
        }
        if (r < keys.length && costs[r]! < mc) m = r;
        if (m === i) break;
        keys[i] = keys[m]!;
        costs[i] = costs[m]!;
        i = m;
      }
      keys[i] = lastKey;
      costs[i] = lastCost;
    }
    return top;
  }
}
