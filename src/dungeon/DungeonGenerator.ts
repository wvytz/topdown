import type {
  DungeonFloor,
  DungeonGeneratorConfig,
  Room,
  TilePoint,
} from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import { createRng } from '@/core/random';
import { STAIRS_SIZE } from '@/config/gameConfig';

const BOSS_ROOM_INDEX = 0;

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
 * Czysta logika — bez Phasera.
 */
export class DungeonGenerator {
  constructor(private readonly config: DungeonGeneratorConfig) {}

  generate(seed: number): DungeonFloor {
    const { widthTiles: width, heightTiles: height } = this.config;
    const rng = createRng(seed);
    const tiles: TileType[] = new Array<TileType>(width * height).fill(TileType.Wall);

    const rects = this.placeRooms(rng);
    if (rects.length < 2) {
      throw new Error(`DungeonGenerator: udało się umieścić tylko ${rects.length} pokój(e) — zwiększ mapę lub zmniejsz pokoje.`);
    }

    for (const rect of rects) this.carveRect(tiles, rect);
    this.connectRooms(tiles, rects, rng);

    // Arena bossa to zawsze pierwszy (duży) pokój; start = pokój najdalszy od niej po ścieżce.
    const bossIndex = BOSS_ROOM_INDEX;
    const startIndex = this.findFarthestRoom(tiles, rects, bossIndex);

    const rooms: Room[] = rects.map((rect, id) => ({
      ...rect,
      id,
      kind: id === startIndex ? RoomKind.Start : id === bossIndex ? RoomKind.Boss : RoomKind.Normal,
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
    };
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

  /** Indeks pokoju, którego środek jest najdalej (w krokach BFS) od środka pokoju `fromIndex`. */
  private findFarthestRoom(tiles: readonly TileType[], rects: readonly RoomRect[], fromIndex: number): number {
    const distances = this.walkDistances(tiles, roomCenter(rects[fromIndex]!));
    let farthest = fromIndex;
    let farthestDistance = -1;
    rects.forEach((rect, index) => {
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
