import type { DungeonFloor, Room } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';

/**
 * Ukryta komnata (krok 46, pomysł właściciela): pokój końcowy za areną wygląda jak lity mur, dopóki gracz
 * nie podejdzie na `revealRadius` kafli (w każdym kierunku). W środku kokony skarbu — rozbijalne, tylko jeden
 * z nich ma losowy przedmiot. Czysta logika: obszar komnaty, maska odsłonięcia, przebranie piętra. Od kroku U4d
 * kokony stoją na piedestałach skarbca pająków (`dungeon/SpiderVault.ts`).
 */
export interface SecretRoomConfig {
  /** Odsłonięcie, gdy gracz jest najwyżej tyle kafli (Czebyszew) od ukrytego kafla. */
  readonly revealRadius: number;
}

export interface SecretArea {
  readonly room: Room;
  /** Indeksy kafli komnaty i korytarza do niej (bez areny) — w przebraniu to mur. */
  readonly tiles: ReadonlySet<number>;
}

const inRect = (r: Room, x: number, y: number) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

/** Obszar komnaty: składowa podłogi z jej środkiem, z wyciętą areną (komnata + korytarz). Null bez komnaty. */
export function secretArea(floor: DungeonFloor): SecretArea | null {
  if (floor.endRoomId === undefined) return null;
  const room = floor.rooms[floor.endRoomId];
  const arena = floor.rooms[floor.bossRoomId];
  if (!room || !arena) return null;
  const { width, height } = floor;
  const open = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && floor.tiles[y * width + x] !== TileType.Wall && !inRect(arena, x, y);
  const start = (room.y + Math.floor(room.height / 2)) * width + room.x + Math.floor(room.width / 2);
  const tiles = new Set<number>([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    const cx = cur % width;
    const cy = Math.floor(cur / width);
    for (const [nx, ny] of [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ] as const) {
      const next = ny * width + nx;
      if (!open(nx, ny) || tiles.has(next)) continue;
      tiles.add(next);
      queue.push(next);
    }
  }
  return { room, tiles };
}

/** Piętro „w przebraniu”: kafle komnaty to mur — do rysowania i rekwizytów (pochodnie), nie do kolizji. */
export function disguiseFloor(floor: DungeonFloor, area: SecretArea): DungeonFloor {
  return { ...floor, tiles: floor.tiles.map((t, i) => (area.tiles.has(i) ? TileType.Wall : t)) };
}

/** Maska kafli, z których gracz odsłania komnatę (najwyżej `radius` kafli od ukrytego kafla). */
export function revealMask(floor: DungeonFloor, area: SecretArea, radius: number): Uint8Array {
  const { width, height } = floor;
  const mask = new Uint8Array(width * height);
  for (const i of area.tiles) {
    const x = i % width;
    const y = Math.floor(i / width);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) mask[ny * width + nx] = 1;
      }
    }
  }
  return mask;
}

/** Prostokąt (w kaflach) obejmujący obszar z zapasem — tu podmieniamy obraz przy odsłonięciu. */
export function areaBounds(floor: DungeonFloor, area: SecretArea, margin: number): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const i of area.tiles) {
    const x = i % floor.width;
    const y = Math.floor(i / floor.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const x = Math.max(0, minX - margin);
  const y = Math.max(0, minY - margin);
  return { x, y, width: Math.min(floor.width - 1, maxX + margin) - x + 1, height: Math.min(floor.height - 1, maxY + margin) - y + 1 };
}
