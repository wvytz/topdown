import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import { findRoomEntrances } from '@/dungeon/arenaGates';

/**
 * Galerie areny (krok 44, Strażnik Bram): wnęki wykute w litej skale za ścianą areny. Kafel ściany areny
 * przed wnęką staje się przejściem — leży w pierścieniu wokół areny, więc dostaje kratę jak każde wejście
 * (`findRoomEntrances`): opada z resztą na początku walki, podnosi się po pokonaniu bossa.
 */
export interface ArenaGalleries {
  readonly floor: DungeonFloor;
  /** Kafel na końcu każdej wnęki — tu staje wróg galerii. */
  readonly posts: readonly TilePoint[];
}

interface Side {
  /** Kierunek na zewnątrz areny. */
  readonly out: TilePoint;
  /** Kafle pierścienia ściany po tej stronie (bez narożników), od środka ku brzegom. */
  readonly ring: readonly TilePoint[];
}

function sidesOf(arena: Room): Side[] {
  const byCenter = (a: number, b: number, center: number) => Math.abs(a - center) - Math.abs(b - center);
  const xs = Array.from({ length: arena.width }, (_, i) => arena.x + i);
  const ys = Array.from({ length: arena.height }, (_, i) => arena.y + i);
  const cx = arena.x + (arena.width - 1) / 2;
  const cy = arena.y + (arena.height - 1) / 2;
  const sortedX = [...xs].sort((a, b) => byCenter(a, b, cx));
  const sortedY = [...ys].sort((a, b) => byCenter(a, b, cy));
  return [
    { out: { x: 0, y: -1 }, ring: sortedX.map((x) => ({ x, y: arena.y - 1 })) },
    { out: { x: 1, y: 0 }, ring: sortedY.map((y) => ({ x: arena.x + arena.width, y })) },
    { out: { x: 0, y: 1 }, ring: sortedX.map((x) => ({ x, y: arena.y + arena.height })) },
    { out: { x: -1, y: 0 }, ring: sortedY.map((y) => ({ x: arena.x - 1, y })) },
  ];
}

/**
 * Wykuwa wnęki w `count` ścianach areny (najpierw w tych z najmniejszą liczbą wejść), jak najbliżej środka ściany.
 * Wnęka i jej otoczenie muszą być litą skałą (nie dotyka innych pokojów ani korytarzy); ściana bez miejsca
 * jest pomijana. Bez RNG — ten sam układ piętra daje te same galerie.
 */
export function carveArenaGalleries(floor: DungeonFloor, count: number, depth: number): ArenaGalleries {
  const arena = floor.rooms[floor.bossRoomId];
  if (!arena || count <= 0) return { floor, posts: [] };
  const entrances = findRoomEntrances(floor, arena);
  const tiles = [...floor.tiles];
  const at = (x: number, y: number) =>
    x < 1 || y < 1 || x >= floor.width - 1 || y >= floor.height - 1 ? null : tiles[y * floor.width + x];
  const isRock = (x: number, y: number) => at(x, y) === TileType.Wall;

  const sides = sidesOf(arena)
    .map((side, order) => ({
      side,
      order,
      doors: entrances.filter((e) => side.ring.some((r) => r.x === e.x && r.y === e.y)).length,
    }))
    .sort((a, b) => a.doors - b.doors || a.order - b.order);

  const posts: TilePoint[] = [];
  for (const { side } of sides) {
    if (posts.length >= count) break;
    const lateral = { x: side.out.y, y: side.out.x };
    // Bez pierwszego i ostatniego kafla ściany — krata przy narożniku wyglądałaby jak wejście z korytarza.
    const candidates = side.ring.slice(0, Math.max(0, side.ring.length - 2));
    for (const mouth of candidates) {
      const cells = Array.from({ length: depth + 1 }, (_, k) => ({ x: mouth.x + side.out.x * k, y: mouth.y + side.out.y * k }));
      const beyond = { x: mouth.x + side.out.x * (depth + 1), y: mouth.y + side.out.y * (depth + 1) };
      const clear = [...cells, beyond].every(
        (c) => isRock(c.x, c.y) && isRock(c.x + lateral.x, c.y + lateral.y) && isRock(c.x - lateral.x, c.y - lateral.y),
      );
      if (!clear) continue;
      for (const c of cells) tiles[c.y * floor.width + c.x] = TileType.Floor;
      posts.push(cells[depth]!);
      break;
    }
  }
  return { floor: { ...floor, tiles }, posts };
}
