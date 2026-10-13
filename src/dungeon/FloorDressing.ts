import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import { createRng } from '@/core/random';
import type { TilesetMeta, TilesetTile } from '@/core/tilesetTypes';
import type { FloorDressingConfig } from '@/config/dressingConfig';
import { STAIRS_SIZE } from '@/config/gameConfig';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { isStairsTile } from '@/dungeon/stairs';

/** Brak kafla w warstwie. */
export const EMPTY_TILE = -1;

/** Warstwa do narysowania: indeks klatki arkusza dla każdego kafla mapy (y * width + x). */
export interface DressedLayer {
  readonly width: number;
  readonly height: number;
  /** Indeks klatki w arkuszu albo EMPTY_TILE. */
  readonly frames: Int32Array;
  /** 1 = kafel odbity w poziomie. */
  readonly flipX: Uint8Array;
}

/** h = krata w poprzek korytarza N-S (wejście od północy/południa), v = w poprzek korytarza E-W. */
export type GateOrientation = 'h' | 'v';
export type GateVisualState = 'open' | 'half' | 'closed';

export interface DressedGate {
  readonly x: number;
  readonly y: number;
  readonly orientation: GateOrientation;
  readonly frames: Readonly<Record<GateVisualState, number>>;
}

export interface DressedStairs {
  /** Lewy górny róg bloku schodów (= DungeonFloor.stairs). */
  readonly anchor: TilePoint;
  /** Klatki części bloku, wiersz po wierszu: zamknięte i otwarte. */
  readonly locked: readonly (readonly number[])[];
  readonly open: readonly (readonly number[])[];
}

/**
 * Wynik dekorowania piętra. Kolejność rysowania (od dołu): floorBase, floorDecal, floorFeature,
 * envShadow, walls, [postacie], overhead. `walls` zawiera wszystkie ściany; `overhead` to kopie ścian
 * z podłogą od północy, rysowane drugi raz nad postaciami (postać stoi „za” takim murem).
 */
export interface DressedFloor {
  readonly floorBase: DressedLayer;
  readonly floorDecal: DressedLayer;
  readonly floorFeature: DressedLayer;
  readonly envShadow: DressedLayer;
  readonly walls: DressedLayer;
  readonly overhead: DressedLayer;
  readonly stairs: DressedStairs;
  readonly gates: readonly DressedGate[];
}

// Bity masek — muszą zgadzać się z arkuszem (sprawdzane w dressFloor).
const N = 1;
const E = 2;
const S = 4;
const W = 8;
const NE = 1;
const SE = 2;
const SW = 4;
const NW = 8;

class LayerBuilder {
  readonly frames: Int32Array;
  readonly flipX: Uint8Array;
  /** Nazwy kafli — do zakazu powtórzeń z sąsiadem. */
  readonly names: (string | null)[];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.frames = new Int32Array(width * height).fill(EMPTY_TILE);
    this.flipX = new Uint8Array(width * height);
    this.names = new Array<string | null>(width * height).fill(null);
  }

  set(x: number, y: number, frame: number, flip: boolean, name: string): void {
    const i = y * this.width + x;
    this.frames[i] = frame;
    this.flipX[i] = flip ? 1 : 0;
    this.names[i] = name;
  }

  nameAt(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.names[y * this.width + x] ?? null;
  }

  isEmpty(x: number, y: number): boolean {
    return this.frames[y * this.width + x] === EMPTY_TILE;
  }

  build(): DressedLayer {
    return { width: this.width, height: this.height, frames: this.frames, flipX: this.flipX };
  }
}

/**
 * Dekoruje piętro kaflami z arkusza: warianty podłogi i ścian, nakładki, cienie, schody, kraty.
 * Czysta funkcja: ten sam (piętro, arkusz, konfiguracja, seed) daje ten sam wynik.
 * Losuje z własnego strumienia RNG (seed podaje wywołujący, z własną solą) — nie rusza zasad gry.
 */
export function dressFloor(
  floor: DungeonFloor,
  tileset: TilesetMeta,
  config: FloorDressingConfig,
  seed: number,
): DressedFloor {
  assertBits(tileset);
  const rng = createRng(seed);
  const { width, height } = floor;
  const ctx = new DressingContext(floor, tileset, config, rng);

  const floorBase = new LayerBuilder(width, height);
  const floorDecal = new LayerBuilder(width, height);
  const floorFeature = new LayerBuilder(width, height);
  const envShadow = new LayerBuilder(width, height);
  const walls = new LayerBuilder(width, height);
  const overhead = new LayerBuilder(width, height);

  const gates = dressGates(ctx);
  const gateSet = new Set(gates.map((g) => g.y * width + g.x));
  const isPlain = (x: number, y: number) =>
    ctx.inBounds(x, y) && floor.tiles[y * width + x] === TileType.Floor && !gateSet.has(y * width + x);

  dressFloorBase(ctx, floorBase, isPlain);
  dressDecals(ctx, floorDecal, isPlain, clearZone(floor, gates, config.clearRadius));
  const stairs = dressStairs(ctx, floorFeature);
  dressEnvShadow(ctx, envShadow);
  dressWalls(ctx, walls, overhead);

  return {
    floorBase: floorBase.build(),
    floorDecal: floorDecal.build(),
    floorFeature: floorFeature.build(),
    envShadow: envShadow.build(),
    walls: walls.build(),
    overhead: overhead.build(),
    stairs,
    gates,
  };
}

/** Orientacja kraty na wejściu do pokoju: wejście z góry/dołu = krata pozioma. */
export function gateOrientation(room: Room, tile: TilePoint): GateOrientation {
  return tile.y === room.y - 1 || tile.y === room.y + room.height ? 'h' : 'v';
}

class DressingContext {
  constructor(
    readonly floor: DungeonFloor,
    readonly tileset: TilesetMeta,
    readonly config: FloorDressingConfig,
    readonly rng: Rng,
  ) {}

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.floor.width && y < this.floor.height;
  }

  /** Ściana albo poza mapą. Kraty i schody to nie ściany. */
  isWall(x: number, y: number): boolean {
    return !this.inBounds(x, y) || this.floor.tiles[y * this.floor.width + x] === TileType.Wall;
  }

  tile(name: string): TilesetTile {
    const tile = this.tileset.tiles[name];
    if (!tile) throw new Error(`FloorDressing: brak kafla „${name}” w arkuszu.`);
    return tile;
  }

  group(name: string): readonly string[] {
    const group = this.tileset.groups[name];
    if (!group || group.length === 0) throw new Error(`FloorDressing: brak grupy „${name}” w arkuszu.`);
    return group;
  }

  /** Wariant z grupy wg wag, z pominięciem nazw sąsiadów (o ile zostaje jakaś inna opcja). */
  pickVariant(group: string, avoid: readonly (string | null)[]): string {
    const all = this.group(group);
    const allowed = all.filter((name) => !avoid.includes(name));
    return pickWeighted(this.rng, allowed.length > 0 ? allowed : all, (name) => this.tile(name).weight ?? 1);
  }

  rollFlip(tile: TilesetTile): boolean {
    return tile.flipX === true && this.rng.chance(this.config.flipChance);
  }
}

function pickWeighted<T>(rng: Rng, items: readonly T[], weightOf: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll < 0) return item;
  }
  const last = items[items.length - 1];
  if (last === undefined) throw new Error('FloorDressing: pusta lista do losowania.');
  return last;
}

function framesOf(tile: TilesetTile): readonly (readonly number[])[] {
  return tile.frames ?? [[tile.frame]];
}

/** Kładzie element (także wielokaflowy) na warstwie; odbicie dotyczy całego elementu. */
function placeTile(layer: LayerBuilder, x: number, y: number, name: string, tile: TilesetTile, flip: boolean): void {
  const frames = framesOf(tile);
  for (let dy = 0; dy < tile.h; dy++) {
    for (let dx = 0; dx < tile.w; dx++) {
      const frame = frames[dy]?.[flip ? tile.w - 1 - dx : dx];
      if (frame === undefined) throw new Error(`FloorDressing: kafel „${name}” ma niepełne części.`);
      layer.set(x + dx, y + dy, frame, flip, name);
    }
  }
}

function assertBits(tileset: TilesetMeta): void {
  const { wall, envShadow } = tileset.autotile;
  const expected: ReadonlyArray<readonly [Readonly<Record<string, number>>, Record<string, number>]> = [
    [wall.bits, { N, E, S, W }],
    [wall.diagonal.bits, { NE, SE, SW, NW }],
    [envShadow.bits, { N, E, W }],
  ];
  for (const [actual, wanted] of expected) {
    for (const [key, bit] of Object.entries(wanted)) {
      if (actual[key] !== bit) throw new Error(`FloorDressing: arkusz ma inny bit ${key} (${actual[key]}), oczekiwano ${bit}.`);
    }
  }
}

// ---------------- podłoga ----------------

function dressFloorBase(ctx: DressingContext, layer: LayerBuilder, isPlain: (x: number, y: number) => boolean): void {
  const { floor, config, rng } = ctx;
  // Najpierw wzory 2×2 w wolnych blokach zwykłej podłogi.
  for (let y = 0; y < floor.height - 1; y++) {
    for (let x = 0; x < floor.width - 1; x++) {
      const block = [
        [x, y],
        [x + 1, y],
        [x, y + 1],
        [x + 1, y + 1],
      ] as const;
      if (!block.every(([bx, by]) => isPlain(bx, by) && layer.isEmpty(bx, by))) continue;
      if (!rng.chance(config.macroChance)) continue;
      const name = ctx.pickVariant(config.floorMacroGroup, []);
      const tile = ctx.tile(name);
      placeTile(layer, x, y, name, tile, ctx.rollFlip(tile));
    }
  }
  // Pod każdą nie-ścianą (także schodami i kratami) leży baza; bez powtórzeń z lewym i górnym sąsiadem.
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (ctx.isWall(x, y) || !layer.isEmpty(x, y)) continue;
      const name = ctx.pickVariant(config.floorGroup, [layer.nameAt(x - 1, y), layer.nameAt(x, y - 1)]);
      const tile = ctx.tile(name);
      placeTile(layer, x, y, name, tile, ctx.rollFlip(tile));
    }
  }
}

/** Kafle bez nakładek: wokół spawnu, schodów i krat (czytelność ważnych miejsc). */
function clearZone(floor: DungeonFloor, gates: readonly TilePoint[], radius: number): Uint8Array {
  const zone = new Uint8Array(floor.width * floor.height);
  const centers: TilePoint[] = [floor.playerSpawn, ...gates];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (isStairsTile(floor, { x, y })) centers.push({ x, y });
    }
  }
  for (const c of centers) {
    for (let y = c.y - radius; y <= c.y + radius; y++) {
      for (let x = c.x - radius; x <= c.x + radius; x++) {
        if (x >= 0 && y >= 0 && x < floor.width && y < floor.height) zone[y * floor.width + x] = 1;
      }
    }
  }
  return zone;
}

function dressDecals(
  ctx: DressingContext,
  layer: LayerBuilder,
  isPlain: (x: number, y: number) => boolean,
  clear: Uint8Array,
): void {
  const { floor, config, rng } = ctx;
  const decorable = (x: number, y: number) => isPlain(x, y) && clear[y * floor.width + x] === 0 && layer.isEmpty(x, y);
  const groups = Object.keys(config.decalGroupWeights);
  const dustSides = [
    [config.dust.north, 0, -1],
    [config.dust.west, -1, 0],
    [config.dust.east, 1, 0],
  ] as const;

  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (!decorable(x, y)) continue;
      if (rng.chance(config.longCrackChance)) {
        const name = ctx.pickVariant(config.longCrackGroup, []);
        const tile = ctx.tile(name);
        let fits = true;
        for (let dy = 0; dy < tile.h; dy++) {
          for (let dx = 0; dx < tile.w; dx++) fits &&= decorable(x + dx, y + dy);
        }
        if (fits) {
          placeTile(layer, x, y, name, tile, ctx.rollFlip(tile));
          continue;
        }
      }
      if (rng.chance(config.decalChance)) {
        const group = pickWeighted(rng, groups, (g) => config.decalGroupWeights[g] ?? 0);
        const name = ctx.pickVariant(group, [layer.nameAt(x - 1, y), layer.nameAt(x, y - 1)]);
        const tile = ctx.tile(name);
        if (tile.w !== 1 || tile.h !== 1) throw new Error(`FloorDressing: zwykła nakładka „${name}” musi mieć 1×1.`);
        placeTile(layer, x, y, name, tile, ctx.rollFlip(tile));
        continue;
      }
      // Kurz nawiany pod ścianę — tylko od strony, gdzie faktycznie stoi mur.
      for (const [side, dx, dy] of dustSides) {
        if (ctx.isWall(x + dx, y + dy) && rng.chance(side.chance)) {
          const name = ctx.pickVariant(side.group, []);
          placeTile(layer, x, y, name, ctx.tile(name), false);
          break;
        }
      }
    }
  }
}

// ---------------- schody i kraty ----------------

function dressStairs(ctx: DressingContext, layer: LayerBuilder): DressedStairs {
  const { floor, config } = ctx;
  const locked = ctx.tile(config.stairsTiles.locked);
  const open = ctx.tile(config.stairsTiles.open);
  for (const tile of [locked, open]) {
    if (tile.w !== STAIRS_SIZE || tile.h !== STAIRS_SIZE) {
      throw new Error(`FloorDressing: kafel schodów ma ${tile.w}×${tile.h}, a schody na mapie ${STAIRS_SIZE}×${STAIRS_SIZE}.`);
    }
  }
  placeTile(layer, floor.stairs.x, floor.stairs.y, config.stairsTiles.locked, locked, false);
  return { anchor: floor.stairs, locked: framesOf(locked), open: framesOf(open) };
}

function dressGates(ctx: DressingContext): DressedGate[] {
  const { floor, config } = ctx;
  const arena = floor.rooms[floor.bossRoomId];
  if (!arena) return [];
  return findRoomEntrances(floor, arena).map((point) => {
    const orientation = gateOrientation(arena, point);
    const names = config.gateTiles[orientation];
    return {
      x: point.x,
      y: point.y,
      orientation,
      frames: { open: ctx.tile(names.open).frame, half: ctx.tile(names.half).frame, closed: ctx.tile(names.closed).frame },
    };
  });
}

// ---------------- cienie i ściany ----------------

function dressEnvShadow(ctx: DressingContext, layer: LayerBuilder): void {
  const { floor, tileset } = ctx;
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (ctx.isWall(x, y)) continue;
      const mask = (ctx.isWall(x, y - 1) ? N : 0) | (ctx.isWall(x + 1, y) ? E : 0) | (ctx.isWall(x - 1, y) ? W : 0);
      const name = tileset.autotile.envShadow.tiles[String(mask)];
      if (mask !== 0 && name) layer.set(x, y, ctx.tile(name).frame, false, name);
    }
  }
}

const FAR_AWAY = 0x3fffffff;

/** Odległość Czebyszewa każdego kafla od najbliższej nie-ściany (0 dla nie-ścian), BFS w 8 kierunkach. */
export function wallDistances(floor: DungeonFloor): Int32Array {
  const { width, height, tiles } = floor;
  const dist = new Int32Array(width * height).fill(-1);
  const queue: number[] = [];
  tiles.forEach((t, i) => {
    if (t !== TileType.Wall) {
      dist[i] = 0;
      queue.push(i);
    }
  });
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const cx = current % width;
    const cy = Math.floor(current / width);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (dist[next] !== -1) continue;
        dist[next] = dist[current]! + 1;
        queue.push(next);
      }
    }
  }
  // Mapa bez podłogi: wszystko traktujemy jako głęboką masę.
  return dist.map((d) => (d === -1 ? FAR_AWAY : d));
}

/** Warianty ścian losujemy bez zakazu powtórzeń: różnią się subtelnie, a zakaz zawyżałby udział zniszczeń. */
function dressWalls(ctx: DressingContext, walls: LayerBuilder, overhead: LayerBuilder): void {
  const { floor, tileset } = ctx;
  const { variants, diagonal, bands } = tileset.autotile.wall;
  const dist = wallDistances(floor);
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (!ctx.isWall(x, y)) continue;
      const d = dist[y * floor.width + x]!;
      if (d >= bands.fade) {
        const group = d >= bands.deep ? bands.groups.deep : bands.groups.fade;
        const name = ctx.pickVariant(group, []);
        walls.set(x, y, ctx.tile(name).frame, false, name);
        continue;
      }
      const mask =
        (ctx.isWall(x, y - 1) ? N : 0) | (ctx.isWall(x + 1, y) ? E : 0) | (ctx.isWall(x, y + 1) ? S : 0) | (ctx.isWall(x - 1, y) ? W : 0);
      let name: string;
      if (mask === diagonal.appliesToMask) {
        const diag =
          (ctx.isWall(x + 1, y - 1) ? 0 : NE) |
          (ctx.isWall(x + 1, y + 1) ? 0 : SE) |
          (ctx.isWall(x - 1, y + 1) ? 0 : SW) |
          (ctx.isWall(x - 1, y - 1) ? 0 : NW);
        const diagName = diagonal.tiles[String(diag)];
        name = diagName ?? ctx.pickVariant(variants[String(mask)] ?? '', []);
      } else {
        const group = variants[String(mask)];
        if (!group) throw new Error(`FloorDressing: arkusz nie opisuje maski ściany ${mask}.`);
        name = ctx.pickVariant(group, []);
      }
      const frame = ctx.tile(name).frame;
      walls.set(x, y, frame, false, name);
      // Mur z podłogą od północy zasłania postać stojącą za nim — druga kopia nad postaciami.
      if ((mask & N) === 0) overhead.set(x, y, frame, false, name);
    }
  }
}
