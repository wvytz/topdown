import type { EnemyType } from '@/core/combatTypes';
import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import { isDeadEndRoom } from '@/dungeon/arenaGates';
import type { GoldReward } from '@/systems/RoomEvents';

/** Przeklęta skrzynia (krok U8b). Liczby w `config/cursedChestConfig.ts`. */
export interface CursedChestConfig {
  readonly enabled: boolean;
  readonly chanceByFloor: readonly number[];
  readonly elitesByFloor: readonly number[];
  readonly types: readonly EnemyType[];
  readonly extraAffixes: number;
  readonly ringTiles: number;
  readonly telegraphMs: number;
  readonly riseMs: number;
  readonly interactRadius: number;
  readonly reward: GoldReward;
}

export interface CursedChestPlan {
  readonly roomId: number;
  readonly tile: TilePoint;
}

function byFloor(table: readonly number[], floor: number): number {
  return table[Math.min(Math.max(0, floor - 1), table.length - 1)] ?? 0;
}

function isFloor(floor: Pick<DungeonFloor, 'tiles' | 'width' | 'height'>, tile: TilePoint): boolean {
  return tile.x >= 0 && tile.y >= 0 && tile.x < floor.width && tile.y < floor.height && floor.tiles[tile.y * floor.width + tile.x] === TileType.Floor;
}

function contains(room: Room, tile: TilePoint): boolean {
  return tile.x >= room.x && tile.x < room.x + room.width && tile.y >= room.y && tile.y < room.y + room.height;
}

/**
 * Miejsce skrzyni: zwykły pokój bez kafli z `avoid` (kapliczka, kryjówki Czyhaczy), najpierw ślepe odnogi.
 * Skrzynia stoi o kafel na północ od środka (środek bywa zajęty przez pochodnię wydarzenia). Szansa wg piętra;
 * `forced` (`?chest=1`) — zawsze. Własny strumień RNG.
 */
export function planCursedChest(
  floor: DungeonFloor,
  floorNumber: number,
  config: CursedChestConfig,
  rng: Rng,
  avoid: readonly TilePoint[],
  forced = false,
): CursedChestPlan | null {
  if (!forced && (!config.enabled || !rng.chance(byFloor(config.chanceByFloor, floorNumber)))) return null;
  const normal = floor.rooms.filter((room) => room.kind === RoomKind.Normal && !avoid.some((t) => contains(room, t)));
  const branches = normal.filter((room) => isDeadEndRoom(floor, room));
  const candidates = branches.length > 0 ? branches : normal;
  if (candidates.length === 0) return null;
  const room = candidates[rng.int(0, candidates.length - 1)]!;
  const tile = { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) - 1 };
  return isFloor(floor, tile) ? { roomId: room.id, tile } : null;
}

/** Skład klątwy: archetypy elit wg piętra (cechy losuje scena tym samym RNG z puli elit). */
export function curseRoster(config: CursedChestConfig, floorNumber: number, rng: Rng): EnemyType[] {
  const count = byFloor(config.elitesByFloor, floorNumber);
  return Array.from({ length: count }, () => config.types[rng.int(0, config.types.length - 1)]!);
}

/** Losuje `count` różnych cech z puli (mniej, jeśli pula mniejsza). */
export function pickAffixes<T>(pool: readonly T[], count: number, rng: Rng): T[] {
  const left = [...pool];
  const out: T[] = [];
  while (out.length < count && left.length > 0) out.push(left.splice(rng.int(0, left.length - 1), 1)[0]!);
  return out;
}

/**
 * Kafle wyjścia elit: pierścień `radius` kafli wokół skrzyni, tylko posadzka w tym samym pokoju, rozłożone
 * równo po obwodzie (najpierw co drugi kafel pierścienia). Za mało miejsca — mniej kafli.
 */
export function curseSpawnTiles(floor: DungeonFloor, room: Room, center: TilePoint, radius: number, count: number): TilePoint[] {
  const ring: TilePoint[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const tile = { x: center.x + dx, y: center.y + dy };
      if (contains(room, tile) && isFloor(floor, tile)) ring.push(tile);
    }
  }
  // Kolejność po kącie — rozkład równy po obwodzie.
  ring.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  if (ring.length <= count) return ring;
  const step = ring.length / count;
  return Array.from({ length: count }, (_, i) => ring[Math.floor(i * step)]!);
}

export enum CursedChestPhase {
  Closed = 'closed',
  /** Otwarta: klątwa wychodzi i walczy. */
  Cursed = 'cursed',
  /** Elity wybite — nagroda wypadła. */
  Lifted = 'lifted',
}

/** Stan skrzyni: otwarcie raz, zdjęcie klątwy, gdy wyszły wszystkie elity i żadna nie żyje. */
export class CursedChestState {
  private phase = CursedChestPhase.Closed;

  get current(): CursedChestPhase {
    return this.phase;
  }

  /** Otwarcie (E); zwraca true tylko za pierwszym razem. */
  open(): boolean {
    if (this.phase !== CursedChestPhase.Closed) return false;
    this.phase = CursedChestPhase.Cursed;
    return true;
  }

  /** Klatka: `pending` — elity jeszcze wychodzą, `alive` — żywe elity klątwy. Zwraca true w chwili zdjęcia klątwy. */
  update(pending: number, alive: number): boolean {
    if (this.phase !== CursedChestPhase.Cursed || pending > 0 || alive > 0) return false;
    this.phase = CursedChestPhase.Lifted;
    return true;
  }
}
