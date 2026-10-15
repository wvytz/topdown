import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import type { BreakableConfig, DartConfig, SpikeConfig } from '@/systems/Traps';

/** Rozmieszczenie pułapek i rzeczy do rozbicia w ruinach (krok 48). Bez Phasera, deterministycznie z RNG. */

export interface SpikePlate {
  readonly tile: TilePoint;
  /** Grupa rytmu (0/1) — sąsiednie płyty wysuwają kolce na zmianę. */
  readonly group: number;
}

export interface DartTrap {
  /** Kafel muru z otworem. */
  readonly shooter: TilePoint;
  /** Kierunek strzału (jednostkowy, wzdłuż osi). */
  readonly direction: TilePoint;
  readonly plate: TilePoint;
  /** Kafle podłogi na linii strzału (od muru z otworem do przeciwległego). */
  readonly line: readonly TilePoint[];
}

export enum BreakableKind {
  Urn = 'urn',
  Crate = 'crate',
}

export interface BreakableSpot {
  readonly tile: TilePoint;
  readonly kind: BreakableKind;
  readonly variant: number;
}

const key = (t: TilePoint) => `${t.x},${t.y}`;
const isFloor = (floor: DungeonFloor, t: TilePoint) =>
  t.x >= 0 && t.y >= 0 && t.x < floor.width && t.y < floor.height && floor.tiles[t.y * floor.width + t.x] === TileType.Floor;

/**
 * Pas płyt z kolcami w poprzek pokoju (prostopadle do dłuższego boku, przez środek) — żeby przejść przez pokój,
 * trzeba go przekroczyć. Płyty naprzemiennie w grupach 0/1. Kafle z `avoid` pomijamy (zostaje bezpieczna luka).
 */
export function planSpikeStrips(floor: DungeonFloor, config: SpikeConfig, rng: Rng, avoid: readonly TilePoint[] = []): SpikePlate[] {
  const blocked = new Set(avoid.map(key));
  const plates: SpikePlate[] = [];
  for (const room of floor.rooms) {
    if (room.kind !== RoomKind.Normal) continue;
    const roll = rng.next();
    if (roll >= config.roomChance || Math.min(room.width, room.height) < config.minShortSide) continue;
    const vertical = room.width >= room.height;
    const length = vertical ? room.height : room.width;
    for (let i = 0; i < length; i++) {
      const tile = vertical
        ? { x: room.x + Math.floor(room.width / 2), y: room.y + i }
        : { x: room.x + i, y: room.y + Math.floor(room.height / 2) };
      if (blocked.has(key(tile)) || !isFloor(floor, tile)) continue;
      plates.push({ tile, group: i % 2 });
    }
  }
  return plates;
}

const DIRECTIONS: readonly TilePoint[] = [
  { x: 0, y: 1 }, // otwór w murze północnym, strzał na południe
  { x: -1, y: 0 }, // otwór we wschodnim, strzał na zachód
  { x: 0, y: -1 },
  { x: 1, y: 0 },
];

/** Kafle muru po stronie pokoju, z której strzela pułapka o kierunku `dir` (bez narożnych). */
function wallSide(room: Room, dir: TilePoint): TilePoint[] {
  if (dir.y === 1) return Array.from({ length: room.width - 2 }, (_, i) => ({ x: room.x + 1 + i, y: room.y - 1 }));
  if (dir.y === -1) return Array.from({ length: room.width - 2 }, (_, i) => ({ x: room.x + 1 + i, y: room.y + room.height }));
  if (dir.x === 1) return Array.from({ length: room.height - 2 }, (_, i) => ({ x: room.x - 1, y: room.y + 1 + i }));
  return Array.from({ length: room.height - 2 }, (_, i) => ({ x: room.x + room.width, y: room.y + 1 + i }));
}

/**
 * Pułapki ze strzałkami: otwór w litym murze pokoju (nie w wejściu), linia strzału przez cały pokój,
 * płyta naciskowa `plateDistance` kafli od muru. Linia i płyta omijają `avoid` (kolce, kapliczka).
 */
export function planDartTraps(floor: DungeonFloor, config: DartConfig, rng: Rng, avoid: readonly TilePoint[] = []): DartTrap[] {
  const blocked = new Set(avoid.map(key));
  const traps: DartTrap[] = [];
  for (const room of floor.rooms) {
    if (room.kind !== RoomKind.Normal) continue;
    const roll = rng.next();
    const firstDir = rng.int(0, DIRECTIONS.length - 1);
    const distance = rng.int(config.plateDistance.min, config.plateDistance.max);
    const pickSeed = rng.next();
    if (roll >= config.roomChance) continue;
    for (let d = 0; d < DIRECTIONS.length; d++) {
      const dir = DIRECTIONS[(firstDir + d) % DIRECTIONS.length]!;
      const length = dir.x === 0 ? room.height : room.width;
      if (length < config.minLine || length <= distance) continue;
      const side = wallSide(room, dir).filter((w) => !isFloor(floor, w) && floor.tiles[w.y * floor.width + w.x] === TileType.Wall);
      if (side.length === 0) continue;
      const start = Math.floor(pickSeed * side.length);
      const found = side
        .map((_, k) => side[(start + k) % side.length]!)
        .map((shooter) => {
          const line = Array.from({ length }, (_, k) => ({ x: shooter.x + dir.x * (k + 1), y: shooter.y + dir.y * (k + 1) }));
          return { shooter, line, plate: line[distance - 1]! };
        })
        .find(({ line }) => line.every((t) => isFloor(floor, t) && !blocked.has(key(t))));
      if (!found) continue;
      traps.push({ shooter: found.shooter, direction: dir, plate: found.plate, line: found.line });
      for (const t of found.line) blocked.add(key(t));
      break;
    }
  }
  return traps;
}

/**
 * Urny i skrzynie: przy ścianach pokojów (zwykłych i startowego), nie przed wejściami (kafel odstępu)
 * i nie na kaflach z `avoid` (pułapki, kapliczka). Bez kolizji — dekoracja do rozbicia.
 */
export function planBreakables(floor: DungeonFloor, config: BreakableConfig, rng: Rng, avoid: readonly TilePoint[] = []): BreakableSpot[] {
  const blocked = new Set(avoid.map(key));
  const spots: BreakableSpot[] = [];
  for (const room of floor.rooms) {
    if (room.kind !== RoomKind.Normal && room.kind !== RoomKind.Start) continue;
    const roll = rng.next();
    const count = rng.int(config.perRoom.min, config.perRoom.max);
    if (roll >= config.roomChance) continue;
    const doors = findRoomEntrances(floor, room);
    const nearDoor = (t: TilePoint) => doors.some((d) => Math.abs(d.x - t.x) <= 1 && Math.abs(d.y - t.y) <= 1);
    const edge: TilePoint[] = [];
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        const onEdge = x === room.x || y === room.y || x === room.x + room.width - 1 || y === room.y + room.height - 1;
        const t = { x, y };
        if (onEdge && isFloor(floor, t) && !blocked.has(key(t)) && !nearDoor(t)) edge.push(t);
      }
    }
    for (let i = 0; i < count && edge.length > 0; i++) {
      const tile = edge.splice(Math.floor(rng.next() * edge.length), 1)[0]!;
      const kind = rng.chance(config.crateChance) ? BreakableKind.Crate : BreakableKind.Urn;
      const variant = kind === BreakableKind.Urn ? rng.int(0, config.urnVariants - 1) : 0;
      spots.push({ tile, kind, variant });
      blocked.add(key(tile));
    }
  }
  return spots;
}
