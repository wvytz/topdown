import type { BiomeAmbientConfig, GraveyardAmbientConfig, GroveAmbientConfig } from '@/config/ambientConfig';
import { AmbientKind } from '@/config/ambientConfig';
import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';

/** Rekwizyt żywego otoczenia na planie piętra (krok 156). */
export interface AmbientSpot {
  readonly kind: AmbientKind;
  readonly tile: TilePoint;
  readonly roomId: number;
  /** Wariant rysunku (wiersz arkusza): kształt kępy, liczba zniczy. */
  readonly variant: number;
  /** Znicz: czy jeszcze się pali (wypalone nie świecą). Inne rodzaje — zawsze true. */
  readonly lit: boolean;
  /** Ile świecących ćm krąży wokół (kępy i lampy Grzybni). */
  readonly moths: number;
}

/** Ile wariantów rysunku ma rodzaj (wiersze arkusza w generatorze `tools/ambient_sprites.py`). */
export const AMBIENT_VARIANTS: Readonly<Record<AmbientKind, number>> = {
  [AmbientKind.Glowcap]: 3,
  [AmbientKind.OvergrownLamp]: 1,
  [AmbientKind.Candle]: 3,
  [AmbientKind.Wisp]: 1,
  [AmbientKind.Raven]: 1,
};

/** Losowań kafla na jeden rekwizyt, zanim się poddamy (mały pokój). */
const TRIES = 16;

/** Pokoje z żywym otoczeniem: startowy i zwykłe (arena, zasadzka i ukryta komnata mają własną oprawę). */
function decorated(room: Room): boolean {
  return room.kind === RoomKind.Start || room.kind === RoomKind.Normal;
}

/**
 * Rozmieszcza żywe otoczenie biomu (czysty planer, własny strumień RNG): kępy grzybów, lampy i znicze pod murami
 * (nie w przejściach), kruki i ogniki w głębi pokoju. Omija kafle z `avoid` (schody, start, kapliczka, kryjówki
 * Czyhaczy) razem z sąsiadami i środek pokoju (kapliczka).
 */
export function planAmbient(floor: DungeonFloor, config: BiomeAmbientConfig, rng: Rng, avoid: readonly TilePoint[] = []): AmbientSpot[] {
  const spots: AmbientSpot[] = [];
  const blocked = [...avoid, floor.stairs, floor.playerSpawn];
  for (const room of floor.rooms) {
    if (!decorated(room)) continue;
    const taken: TilePoint[] = [];
    if (config.grove) spots.push(...planGroveRoom(floor, room, config.grove, rng, blocked, taken));
    if (config.graveyard) spots.push(...planGraveyardRoom(floor, room, config.graveyard, rng, blocked, taken));
  }
  return spots;
}

function planGroveRoom(
  floor: DungeonFloor,
  room: Room,
  config: GroveAmbientConfig,
  rng: Rng,
  blocked: readonly TilePoint[],
  taken: TilePoint[],
): AmbientSpot[] {
  const spots: AmbientSpot[] = [];
  const nearWall = (t: TilePoint) => isWallSpot(floor, room, t, config.wallReachTiles);
  const moths = () => (rng.chance(config.moths.chance) ? rng.int(config.moths.count.min, config.moths.count.max) : 0);
  if (rng.chance(config.lampChance)) {
    const tile = pickTile(floor, room, rng, 1, nearWall, blocked, taken, config.minSpacingTiles);
    if (tile) spots.push(spot(AmbientKind.OvergrownLamp, tile, room, 0, true, moths()));
  }
  const count = rng.int(config.glowcapsPerRoom.min, config.glowcapsPerRoom.max);
  for (let i = 0; i < count; i++) {
    const tile = pickTile(floor, room, rng, 1, nearWall, blocked, taken, config.minSpacingTiles);
    if (!tile) break;
    spots.push(spot(AmbientKind.Glowcap, tile, room, rng.int(0, AMBIENT_VARIANTS[AmbientKind.Glowcap] - 1), true, moths()));
  }
  return spots;
}

function planGraveyardRoom(
  floor: DungeonFloor,
  room: Room,
  config: GraveyardAmbientConfig,
  rng: Rng,
  blocked: readonly TilePoint[],
  taken: TilePoint[],
): AmbientSpot[] {
  const spots: AmbientSpot[] = [];
  const nearWall = (t: TilePoint) => isWallSpot(floor, room, t, config.wallReachTiles);
  const candles = rng.int(config.candlesPerRoom.min, config.candlesPerRoom.max);
  for (let i = 0; i < candles; i++) {
    const tile = pickTile(floor, room, rng, 1, nearWall, blocked, taken, config.minSpacingTiles);
    if (!tile) break;
    const variant = rng.int(0, AMBIENT_VARIANTS[AmbientKind.Candle] - 1);
    spots.push(spot(AmbientKind.Candle, tile, room, variant, rng.chance(config.litChance), 0));
  }
  // Ognik i kruki z dala od murów; między sobą bliżej niż rekwizyty pod murem (stadko).
  const inner = (t: TilePoint) => !isWallSpot(floor, room, t, 1);
  if (rng.chance(config.wisps.roomChance)) {
    const tile = pickTile(floor, room, rng, 2, inner, blocked, taken, 2);
    if (tile) spots.push(spot(AmbientKind.Wisp, tile, room, 0, true, 0));
  }
  if (rng.chance(config.ravens.roomChance)) {
    const count = rng.int(config.ravens.count.min, config.ravens.count.max);
    for (let i = 0; i < count; i++) {
      const tile = pickTile(floor, room, rng, 1, inner, blocked, taken, 1);
      if (!tile) break;
      spots.push(spot(AmbientKind.Raven, tile, room, 0, true, 0));
    }
  }
  return spots;
}

function spot(kind: AmbientKind, tile: TilePoint, room: Room, variant: number, lit: boolean, moths: number): AmbientSpot {
  return { kind, tile, roomId: room.id, variant, lit, moths };
}

/** Losuje wolny kafel podłogi w pokoju (z marginesem od brzegu pokoju), spełniający `fits`, z odstępem od zajętych. */
function pickTile(
  floor: DungeonFloor,
  room: Room,
  rng: Rng,
  margin: number,
  fits: (tile: TilePoint) => boolean,
  blocked: readonly TilePoint[],
  taken: TilePoint[],
  spacing: number,
): TilePoint | null {
  const center: TilePoint = { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
  const minX = room.x + margin - 1;
  const maxX = room.x + room.width - margin;
  const minY = room.y + margin - 1;
  const maxY = room.y + room.height - margin;
  if (minX > maxX || minY > maxY) return null;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const tile: TilePoint = { x: rng.int(minX, maxX), y: rng.int(minY, maxY) };
    if (floor.tiles[tile.y * floor.width + tile.x] !== TileType.Floor) continue;
    if (chebyshev(tile, center) <= 1) continue;
    if (blocked.some((b) => chebyshev(tile, b) <= 1)) continue;
    if (taken.some((t) => chebyshev(tile, t) < spacing)) continue;
    if (!fits(tile)) continue;
    taken.push(tile);
    return tile;
  }
  return null;
}

/**
 * Kafel pod murem: ściana najwyżej `reach` kafli dalej (w kwadracie), ale nie w przejściu — żaden sąsiad poza
 * pokojem nie jest podłogą (drzwi, korytarz).
 */
export function isWallSpot(floor: DungeonFloor, room: Room, tile: TilePoint, reach: number): boolean {
  let wall = false;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = tile.x + dx;
      const y = tile.y + dy;
      const type = x < 0 || y < 0 || x >= floor.width || y >= floor.height ? TileType.Wall : floor.tiles[y * floor.width + x];
      if (type === TileType.Wall) wall = true;
      const outside = x < room.x || y < room.y || x >= room.x + room.width || y >= room.y + room.height;
      if (outside && type !== TileType.Wall && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return false;
    }
  }
  return wall;
}

function chebyshev(a: TilePoint, b: TilePoint): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
