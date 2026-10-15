import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';

/**
 * Reguła areny na końcu piętra (krok 45, decyzja właściciela): przez arenę bossa nie da się przejść
 * do reszty piętra. Arena ma jedno połączenie z resztą i może prowadzić najwyżej do jednego dodatkowego,
 * ślepego pomieszczenia — końcowego przed wyjściem z piętra.
 */
export interface BossRoomCheck {
  readonly ok: boolean;
  /** Pokój osiągalny tylko przez arenę; null, gdy go nie ma. */
  readonly endRoomId: number | null;
  readonly reason?: string;
}

const inRect = (room: Room, x: number, y: number) =>
  x >= room.x && x < room.x + room.width && y >= room.y && y < room.y + room.height;

/**
 * Sprawdza regułę na kaflach piętra: spójne składowe podłogi z wyciętą areną. Wszystkie pokoje poza
 * najwyżej jednym muszą leżeć w składowej startu; ten jeden — sam w swojej składowej. Z każdą z nich arena ma
 * dokładnie jedno przejście (bez pętli przez arenę), a z żadną inną składową (np. ślepym kikutem korytarza) — żadnego.
 */
export function checkBossRoomAtEnd(floor: DungeonFloor): BossRoomCheck {
  const arena = floor.rooms[floor.bossRoomId];
  if (!arena) return { ok: false, endRoomId: null, reason: 'brak areny' };
  const { width, height, tiles } = floor;
  const label = new Int32Array(width * height).fill(-1);
  const open = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && tiles[y * width + x] !== TileType.Wall && !inRect(arena, x, y);

  let components = 0;
  for (let i = 0; i < tiles.length; i++) {
    const sx = i % width;
    const sy = Math.floor(i / width);
    if (label[i] !== -1 || !open(sx, sy)) continue;
    const queue = [i];
    label[i] = components;
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
        if (!open(nx, ny) || label[next] !== -1) continue;
        label[next] = components;
        queue.push(next);
      }
    }
    components++;
  }

  const componentOf = (p: TilePoint) => label[p.y * width + p.x]!;
  const center = (r: Room): TilePoint => ({ x: r.x + Math.floor(r.width / 2), y: r.y + Math.floor(r.height / 2) });
  const start = floor.rooms[floor.startRoomId];
  if (!start) return { ok: false, endRoomId: null, reason: 'brak startu' };
  const main = componentOf(center(start));
  const others = floor.rooms.filter((r) => r.id !== arena.id && componentOf(center(r)) !== main);
  if (others.length > 1) return { ok: false, endRoomId: null, reason: 'przez arenę prowadzi więcej niż jeden pokój' };
  const end = others[0] ?? null;
  const endComponent = end ? componentOf(center(end)) : null;
  if (end && floor.rooms.some((r) => r.id !== end.id && r.id !== arena.id && componentOf(center(r)) === endComponent)) {
    return { ok: false, endRoomId: null, reason: 'pokój końcowy nie jest ślepy' };
  }

  // Wejścia areny: grupy sąsiadujących kafli podłogi w pierścieniu wokół niej (jedna grupa = jedno przejście).
  const ring: TilePoint[] = [];
  for (let y = arena.y - 1; y <= arena.y + arena.height; y++) {
    for (let x = arena.x - 1; x <= arena.x + arena.width; x++) {
      if (!inRect(arena, x, y) && open(x, y)) ring.push({ x, y });
    }
  }
  const doorsPerComponent = new Map<number, number>();
  const seen = new Set<number>();
  for (const tile of ring) {
    if (seen.has(tile.y * width + tile.x)) continue;
    doorsPerComponent.set(componentOf(tile), (doorsPerComponent.get(componentOf(tile)) ?? 0) + 1);
    const stack = [tile];
    seen.add(tile.y * width + tile.x);
    while (stack.length > 0) {
      const t = stack.pop()!;
      for (const n of ring) {
        const key = n.y * width + n.x;
        if (!seen.has(key) && Math.abs(n.x - t.x) <= 1 && Math.abs(n.y - t.y) <= 1) {
          seen.add(key);
          stack.push(n);
        }
      }
    }
  }
  if (doorsPerComponent.get(main) !== 1) return { ok: false, endRoomId: null, reason: 'arena musi mieć dokładnie jedno wejście z reszty piętra' };
  if (endComponent !== null && doorsPerComponent.get(endComponent) !== 1) return { ok: false, endRoomId: null, reason: 'pokój końcowy musi mieć jedno przejście z areny' };
  if (doorsPerComponent.size > (end ? 2 : 1)) return { ok: false, endRoomId: null, reason: 'z areny wychodzi dodatkowe przejście' };
  return { ok: true, endRoomId: end?.id ?? null };
}
