import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';

/**
 * Wejścia do pokoju: kafle podłogi w pierścieniu tuż za jego obrysem (także narożniki).
 * Zamknięcie ich wszystkich odcina pokój od reszty piętra.
 */
export function findRoomEntrances(floor: Pick<DungeonFloor, 'width' | 'height' | 'tiles'>, room: Room): TilePoint[] {
  const entrances: TilePoint[] = [];
  const left = room.x - 1;
  const right = room.x + room.width;
  const top = room.y - 1;
  const bottom = room.y + room.height;

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const onRing = x === left || x === right || y === top || y === bottom;
      if (!onRing || x < 0 || y < 0 || x >= floor.width || y >= floor.height) continue;
      if (floor.tiles[y * floor.width + x] !== TileType.Wall) entrances.push({ x, y });
    }
  }
  return entrances;
}

/** Czy kafel leży w pokoju co najmniej `margin` kafli od jego krawędzi. */
export function isDeepInsideRoom(room: Room, tile: TilePoint, margin: number): boolean {
  return (
    tile.x >= room.x + margin &&
    tile.x < room.x + room.width - margin &&
    tile.y >= room.y + margin &&
    tile.y < room.y + room.height - margin
  );
}

export enum ArenaGateState {
  /** Przed walką: wejścia otwarte. */
  Open = 'open',
  /** Walka trwa: kraty opuszczone. */
  Sealed = 'sealed',
  /** Boss pokonany: kraty podniesione na stałe. */
  Released = 'released',
}

export interface ArenaGateInput {
  readonly bossFighting: boolean;
  readonly bossDefeated: boolean;
  /** Kafel, na którym stoi środek gracza. */
  readonly playerTile: TilePoint;
}

/** Zmiana stanu do wykonania przez warstwę silnika (null = bez zmian). */
export type ArenaGateChange = 'seal' | 'release' | null;

/**
 * Kraty areny bossa. Opadają, gdy walka trwa, a gracz jest w głębi areny
 * (margines gwarantuje, że krata nie spadnie na gracza stojącego w przejściu).
 * Podnoszą się na stałe po pokonaniu bossa.
 */
export class ArenaGateLock {
  private current = ArenaGateState.Open;

  constructor(
    private readonly arena: Room,
    private readonly sealMarginTiles: number,
  ) {}

  get state(): ArenaGateState {
    return this.current;
  }

  update(input: ArenaGateInput): ArenaGateChange {
    if (this.current === ArenaGateState.Released) return null;

    if (input.bossDefeated) {
      const wasSealed = this.current === ArenaGateState.Sealed;
      this.current = ArenaGateState.Released;
      return wasSealed ? 'release' : null;
    }

    if (
      this.current === ArenaGateState.Open &&
      input.bossFighting &&
      isDeepInsideRoom(this.arena, input.playerTile, this.sealMarginTiles)
    ) {
      this.current = ArenaGateState.Sealed;
      return 'seal';
    }
    return null;
  }
}
