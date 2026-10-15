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
 * Generuje piętro: losowo rozmieszczone pokoje połączone korytarzami w kształcie litery L.
 * Połączenia = minimalne drzewo rozpinające (gwarantuje spójność) + kilka dodatkowych pętli.
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

    // Schody STAIRS_SIZE × STAIRS_SIZE wyśrodkowane w arenie; `stairs` to lewy górny róg bloku.
    const bossCenter = roomCenter(rects[bossIndex]!);
    const half = Math.floor(STAIRS_SIZE / 2);
    const stairs: TilePoint = { x: bossCenter.x - half, y: bossCenter.y - half };
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
    const connected = new Set<number>([main[0]!]);
    while (connected.size < main.length) {
      let bestFrom = -1;
      let bestTo = -1;
      let bestDistance = Infinity;
      for (const from of connected) {
        for (const to of main) {
          if (connected.has(to)) continue;
          const distance = centerDistanceSq(rects[from]!, rects[to]!);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestFrom = from;
            bestTo = to;
          }
        }
      }
      if (!this.carveRouted(tiles, roomCenter(rects[bestFrom]!), roomCenter(rects[bestTo]!), rng, blockedMain)) return undefined;
      connected.add(bestTo);
    }
    const extraConnections = Math.floor(main.length * this.config.extraConnectionRatio);
    for (let i = 0; i < extraConnections; i++) {
      const a = main[rng.int(0, main.length - 1)]!;
      const b = main[rng.int(0, main.length - 1)]!;
      if (a !== b) this.carveRouted(tiles, roomCenter(rects[a]!), roomCenter(rects[b]!), rng, blockedMain);
    }

    // Jedno wejście na arenę: z najbliższego pokoju reszty piętra.
    if (!this.carveRouted(tiles, roomCenter(boss), roomCenter(rects[main[0]!]!), rng, avoidEnd)) return undefined;
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
    // Algorytm Prima na odległościach między środkami pokojów.
    const connected = new Set<number>([0]);
    while (connected.size < rects.length) {
      let bestFrom = -1;
      let bestTo = -1;
      let bestDistance = Infinity;
      for (const from of connected) {
        for (let to = 0; to < rects.length; to++) {
          if (connected.has(to)) continue;
          const distance = centerDistanceSq(rects[from]!, rects[to]!);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestFrom = from;
            bestTo = to;
          }
        }
      }
      this.carveCorridor(tiles, roomCenter(rects[bestFrom]!), roomCenter(rects[bestTo]!), rng);
      connected.add(bestTo);
    }

    const extraConnections = Math.floor(rects.length * this.config.extraConnectionRatio);
    for (let i = 0; i < extraConnections; i++) {
      const a = rng.int(0, rects.length - 1);
      const b = rng.int(0, rects.length - 1);
      if (a !== b) this.carveCorridor(tiles, roomCenter(rects[a]!), roomCenter(rects[b]!), rng);
    }
  }

  private carveCorridor(tiles: TileType[], from: TilePoint, to: TilePoint, rng: Rng): void {
    const corner: TilePoint = rng.chance(0.5) ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
    this.carveLine(tiles, from, corner);
    this.carveLine(tiles, corner, to);
  }

  /** Linia pozioma lub pionowa „pędzlem” o szerokości korytarza. */
  private carveLine(tiles: TileType[], from: TilePoint, to: TilePoint): void {
    const stepX = Math.sign(to.x - from.x);
    const stepY = Math.sign(to.y - from.y);
    let x = from.x;
    let y = from.y;
    for (;;) {
      this.carveBrush(tiles, x, y);
      if (x === to.x && y === to.y) break;
      x += stepX;
      y += stepY;
    }
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
