import type { ArenaConditionsConfig, ArenaLayout, RubbleTile } from '@/core/arenaConditionTypes';
import { ArenaSide } from '@/core/arenaConditionTypes';
import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import { STAIRS_SIZE } from '@/config/gameConfig';
import { findRoomEntrances } from '@/dungeon/arenaGates';

/**
 * Rozmieszczenie stałych elementów zmiennych warunków areny (krok 160): gruz grubych murów i butle chloru,
 * wiadra, lustra, słupy z gniazdami i bok tarasu nad przepaścią. Czysty planer — deterministyczny z RNG.
 *
 * Zasady spójności (prośba właściciela: „żeby nie było konfliktów”): nic nie stoi przy wejściu, na schodach ani na
 * środku (start bossa); kolidujące rekwizyty (lustra, słupy) stoją parami symetrycznie, z dala od murów, żeby nie
 * zamykały przejść; żaden element nie wchodzi na drugi.
 */

const key = (p: TilePoint): string => `${p.x},${p.y}`;
const chebyshev = (a: TilePoint, b: TilePoint): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

type FloorGrid = Pick<DungeonFloor, 'width' | 'height' | 'tiles' | 'stairs'>;

/** Kafle areny, na których nic nie może stanąć (ani pęknąć): okolica wejść i schodów. */
export function reservedTiles(floor: FloorGrid, arena: Room, clearTiles: number): Set<string> {
  const reserved = new Set<string>();
  const entrances = findRoomEntrances(floor as DungeonFloor, arena);
  const stairs: TilePoint[] = [];
  for (let dy = 0; dy < STAIRS_SIZE; dy++) for (let dx = 0; dx < STAIRS_SIZE; dx++) stairs.push({ x: floor.stairs.x + dx, y: floor.stairs.y + dy });
  for (let y = arena.y; y < arena.y + arena.height; y++) {
    for (let x = arena.x; x < arena.x + arena.width; x++) {
      const tile = { x, y };
      if (entrances.some((e) => chebyshev(e, tile) <= clearTiles) || stairs.some((s) => chebyshev(s, tile) <= 1)) reserved.add(key(tile));
    }
  }
  return reserved;
}

/** Bok areny bez wejścia, nad którym wisi taras (preferowane: południe, potem wschód i zachód). */
export function pickAbyssSide(floor: FloorGrid, arena: Room): ArenaSide | null {
  const entrances = findRoomEntrances(floor as DungeonFloor, arena);
  const sides: Record<ArenaSide.South | ArenaSide.East | ArenaSide.West, (e: TilePoint) => boolean> = {
    [ArenaSide.South]: (e) => e.y === arena.y + arena.height,
    [ArenaSide.East]: (e) => e.x === arena.x + arena.width,
    [ArenaSide.West]: (e) => e.x === arena.x - 1,
  };
  for (const side of [ArenaSide.South, ArenaSide.East, ArenaSide.West] as const) {
    if (!entrances.some(sides[side])) return side;
  }
  return null;
}

/** Grube mury po bokach areny: wschodni wali się w fazie 1, zachodni w fazie 2. */
export function planRubble(floor: FloorGrid, arena: Room, depth: number, cornerGap: number, reserved: ReadonlySet<string>): RubbleTile[] {
  const rubble: RubbleTile[] = [];
  for (let y = arena.y + cornerGap; y < arena.y + arena.height - cornerGap; y++) {
    for (let d = 0; d < depth; d++) {
      for (const [x, phase] of [
        [arena.x + arena.width - 1 - d, 1],
        [arena.x + d, 2],
      ] as const) {
        const tile = { x, y };
        if (reserved.has(key(tile)) || floor.tiles[y * floor.width + x] !== TileType.Floor) continue;
        rubble.push({ x, y, phase });
      }
    }
  }
  return rubble;
}

/** Symetryczne pary kafli wokół środka areny w otwartej części (bez gruzu), z marginesem od brzegów. */
function symmetricPairs(open: Room, margin: number, minFromCenter: number, taken: ReadonlySet<string>): Array<[TilePoint, TilePoint]> {
  const pairs: Array<[TilePoint, TilePoint]> = [];
  const cx2 = open.x * 2 + open.width - 1;
  const cy2 = open.y * 2 + open.height - 1;
  const center = { x: Math.floor(cx2 / 2), y: Math.floor(cy2 / 2) };
  for (let y = open.y + margin; y < open.y + open.height - margin; y++) {
    for (let x = open.x + margin; x < open.x + open.width - margin; x++) {
      const a = { x, y };
      const b = { x: cx2 - x, y: cy2 - y };
      // Każda para raz: pierwszy kafel wcześniej w kolejności wierszy (środek sam ze sobą odpada).
      if (!(a.y < b.y || (a.y === b.y && a.x < b.x))) continue;
      if (chebyshev(a, center) < minFromCenter || chebyshev(b, center) < minFromCenter) continue;
      if (taken.has(key(a)) || taken.has(key(b))) continue;
      pairs.push([a, b]);
    }
  }
  return pairs;
}

/** Wolne kafle otwartej części areny z marginesem od brzegów. */
function openTiles(open: Room, margin: number, taken: ReadonlySet<string>): TilePoint[] {
  const tiles: TilePoint[] = [];
  for (let y = open.y + margin; y < open.y + open.height - margin; y++) {
    for (let x = open.x + margin; x < open.x + open.width - margin; x++) if (!taken.has(key({ x, y }))) tiles.push({ x, y });
  }
  return tiles;
}

/** Zajmuje kafel i jego sąsiedztwo (żeby dwa elementy nie stały obok siebie). */
function occupy(taken: Set<string>, tile: TilePoint, ring: number): void {
  for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) taken.add(key({ x: tile.x + dx, y: tile.y + dy }));
}

export function planArenaLayout(floor: FloorGrid, arena: Room, config: ArenaConditionsConfig, rng: Rng): ArenaLayout {
  const clear = Math.max(config.collapse?.entranceClearTiles ?? 0, config.terrace?.clearTiles ?? 0, 2);
  const reserved = reservedTiles(floor, arena, clear);
  const collapse = config.collapse;
  const rubble = collapse ? planRubble(floor, arena, collapse.depthTiles, collapse.cornerGapTiles, reserved) : [];

  // Butle chloru: w najgłębszej kolumnie muru fazy 1, rozłożone po wysokości.
  const deepest = rubble.filter((r) => r.phase === 1 && r.x === arena.x + arena.width - 1);
  const bottleCount = Math.min(collapse?.bottles.count ?? 0, deepest.length);
  const bottles: TilePoint[] = [];
  for (let i = 0; i < bottleCount; i++) {
    const r = deepest[Math.floor(((i + 0.5) * deepest.length) / bottleCount)]!;
    bottles.push({ x: r.x, y: r.y });
  }

  // Otwarta część areny: bez kolumn gruzu (lustra, wiadra i słupy nie stoją w murze, który się zawali).
  const depth = collapse ? collapse.depthTiles : 0;
  const open: Room = { ...arena, x: arena.x + depth, width: arena.width - depth * 2 };
  const taken = new Set<string>([...reserved, ...rubble.map(key)]);
  const center = { x: Math.floor(arena.x + (arena.width - 1) / 2), y: Math.floor(arena.y + (arena.height - 1) / 2) };
  occupy(taken, center, 1);

  const pickPair = (margin: number, minFromCenter: number): TilePoint[] => {
    const pairs = symmetricPairs(open, margin, minFromCenter, taken);
    if (pairs.length === 0) return [];
    const [a, b] = pairs[rng.int(0, pairs.length - 1)]!;
    occupy(taken, a, 1);
    occupy(taken, b, 1);
    return [a, b];
  };

  const mirrors = config.mirrors ? pickPair(1, 2).slice(0, config.mirrors.count) : [];
  const pillars = config.nestPillars ? pickPair(2, 2).slice(0, config.nestPillars.count) : [];

  const buckets: TilePoint[] = [];
  for (let i = 0; i < (config.wetFloor?.buckets.count ?? 0); i++) {
    const free = openTiles(open, 1, taken);
    if (free.length === 0) break;
    const tile = free[rng.int(0, free.length - 1)]!;
    occupy(taken, tile, 1);
    buckets.push(tile);
  }

  return { rubble, bottles, buckets, mirrors, pillars, abyss: config.terrace ? pickAbyssSide(floor, arena) : null };
}

/**
 * Piętro z kaflami `walls` zamienionymi w mur (gruz grubych murów przed walką, krok 160). Nowa tablica kafli —
 * wejściowe piętro bez zmian.
 */
export function withWallTiles<T extends Pick<DungeonFloor, 'width' | 'tiles'>>(floor: T, walls: readonly TilePoint[]): T {
  const tiles = [...floor.tiles];
  for (const t of walls) tiles[t.y * floor.width + t.x] = TileType.Wall;
  return { ...floor, tiles };
}

/**
 * Zmienna przeszkoda w trakcie walki (lustro, słup, żywopłot, zawalony gruz): kafel piętra zmienia typ w miejscu,
 * żeby linia wzroku wrogów i ich droga po kaflach (kroki 30, 152) widziały to samo co fizyka.
 */
export function setFloorTile(floor: Pick<DungeonFloor, 'width' | 'tiles'>, tile: TilePoint, type: TileType): void {
  (floor.tiles as TileType[])[tile.y * floor.width + tile.x] = type;
}
