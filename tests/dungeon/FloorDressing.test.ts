import { describe, expect, it } from 'vitest';
import type { DungeonFloor } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { TilesetMeta } from '@/core/tilesetTypes';
import type { FloorDressingConfig } from '@/config/dressingConfig';
import { FLOOR_DRESSING } from '@/config/dressingConfig';
import type { DressedFloor, DressedLayer } from '@/dungeon/FloorDressing';
import { EMPTY_TILE, dressFloor, gateOrientation, wallDistances } from '@/dungeon/FloorDressing';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { isStairsTile, stairsTiles } from '@/dungeon/stairs';
import { floorFromAscii, room, sampleFloors } from '../helpers/floors';
import { loadTileset } from '../helpers/tileset';

const TILESET = loadTileset();
const SEED = 1234;

/** Pokój 4×4 otoczony murem grubości 3 — do sprawdzania masek, pasm i cieni kafel po kaflu. */
const BOX = floorFromAscii([
  '##########',
  '##########',
  '##########',
  '###....###',
  '###....###',
  '###....###',
  '###....###',
  '##########',
  '##########',
  '##########',
]);

/** Arena z wejściem od północy (korytarz 2 kafle) i od zachodu, spawn w korytarzu. */
const ARENA = floorFromAscii(
  [
    '##########',
    '####..####',
    '####..####',
    '##......##',
    '@.......##',
    '........##',
    '##......##',
    '##########',
  ],
  [room(0, 2, 3, 6, 4, RoomKind.Boss)],
);

const at = (layer: DressedLayer, x: number, y: number) => layer.frames[y * layer.width + x]!;
const flippedAt = (layer: DressedLayer, x: number, y: number) => layer.flipX[y * layer.width + x] === 1;
const frameOf = (name: string) => TILESET.tiles[name]!.frame;
const groupFrames = (group: string) => new Set(TILESET.groups[group]!.map(frameOf));
const dress = (floor: DungeonFloor, config: FloorDressingConfig = FLOOR_DRESSING, seed = SEED) =>
  dressFloor(floor, TILESET, config, seed);

const NO_DECALS: FloorDressingConfig = {
  ...FLOOR_DRESSING,
  decalChance: 0,
  longCrackChance: 0,
  dust: {
    north: { ...FLOOR_DRESSING.dust.north, chance: 0 },
    west: { ...FLOOR_DRESSING.dust.west, chance: 0 },
    east: { ...FLOOR_DRESSING.dust.east, chance: 0 },
  },
};

/** Każda klatka arkusza → kafel, do którego należy (także części elementów wielokaflowych). */
const TILE_BY_FRAME = new Map<number, { name: string; dx: number; dy: number }>();
for (const [name, tile] of Object.entries(TILESET.tiles)) {
  (tile.frames ?? [[tile.frame]]).forEach((row, dy) => row.forEach((frame, dx) => TILE_BY_FRAME.set(frame, { name, dx, dy })));
}

function allLayers(d: DressedFloor): Array<[string, DressedLayer]> {
  return [
    ['floorBase', d.floorBase],
    ['floorDecal', d.floorDecal],
    ['floorFeature', d.floorFeature],
    ['envShadow', d.envShadow],
    ['walls', d.walls],
    ['overhead', d.overhead],
  ];
}

describe('FloorDressing — ściany', () => {
  const d = dress(BOX);

  it('pasma odległości: brzeg (1), przygaszony (2), głębia (3+)', () => {
    const dist = wallDistances(BOX);
    expect(dist[2 * BOX.width + 4]).toBe(1);
    expect(dist[1 * BOX.width + 4]).toBe(2);
    expect(dist[0 * BOX.width + 4]).toBe(3);
    expect(dist[4 * BOX.width + 4]).toBe(0);
    expect(groupFrames('wallBand.fade').has(at(d.walls, 4, 1))).toBe(true);
    expect(groupFrames('wallBand.deep').has(at(d.walls, 4, 0))).toBe(true);
    expect(groupFrames('wallBand.deep').has(at(d.walls, 0, 0))).toBe(true);
  });

  it('maska 4-bit wybiera grupę: mur nad pokojem 11, pod 14, po bokach 13 i 7', () => {
    expect(groupFrames('wall.11').has(at(d.walls, 4, 2))).toBe(true);
    expect(groupFrames('wall.14').has(at(d.walls, 4, 7))).toBe(true);
    expect(groupFrames('wall.13').has(at(d.walls, 2, 4))).toBe(true);
    expect(groupFrames('wall.7').has(at(d.walls, 7, 4))).toBe(true);
  });

  it('narożniki (maska 15 z podłogą po skosie) dostają kafel z domkniętym obrysem', () => {
    expect(at(d.walls, 2, 2)).toBe(frameOf('wall_15_d02')); // podłoga na SE
    expect(at(d.walls, 7, 2)).toBe(frameOf('wall_15_d04')); // SW
    expect(at(d.walls, 2, 7)).toBe(frameOf('wall_15_d01')); // NE
    expect(at(d.walls, 7, 7)).toBe(frameOf('wall_15_d08')); // NW
  });

  it('każda ściana ma kafel w warstwie ścian, a podłoga nie', () => {
    for (let y = 0; y < BOX.height; y++) {
      for (let x = 0; x < BOX.width; x++) {
        const isWall = BOX.tiles[y * BOX.width + x] === TileType.Wall;
        expect(at(d.walls, x, y) !== EMPTY_TILE, `(${x},${y})`).toBe(isWall);
      }
    }
  });

  it('nad postaciami: dokładnie mury brzegowe z podłogą od północy, ta sama klatka co w warstwie ścian', () => {
    for (let y = 0; y < BOX.height; y++) {
      for (let x = 0; x < BOX.width; x++) {
        const expected = y === 7 && x >= 3 && x <= 6;
        expect(at(d.overhead, x, y) !== EMPTY_TILE, `(${x},${y})`).toBe(expected);
        if (expected) expect(at(d.overhead, x, y)).toBe(at(d.walls, x, y));
      }
    }
  });
});

describe('FloorDressing — podłoga, cienie, nakładki', () => {
  it('pod każdą nie-ścianą leży baza podłogi, pod ścianą nie', () => {
    const d = dress(BOX);
    for (let y = 0; y < BOX.height; y++) {
      for (let x = 0; x < BOX.width; x++) {
        const isWall = BOX.tiles[y * BOX.width + x] === TileType.Wall;
        expect(at(d.floorBase, x, y) === EMPTY_TILE, `(${x},${y})`).toBe(isWall);
      }
    }
  });

  it('cienie środowiska: pas pod murem od północy, wąskie pasy przy bocznych ścianach', () => {
    const d = dress(BOX);
    expect(at(d.envShadow, 3, 3)).toBe(frameOf('shadow_09')); // N + W
    expect(at(d.envShadow, 4, 3)).toBe(frameOf('shadow_01')); // N
    expect(at(d.envShadow, 6, 3)).toBe(frameOf('shadow_03')); // N + E
    expect(at(d.envShadow, 3, 4)).toBe(frameOf('shadow_08')); // W
    expect(at(d.envShadow, 6, 5)).toBe(frameOf('shadow_02')); // E
    expect(at(d.envShadow, 4, 4)).toBe(EMPTY_TILE);
    expect(at(d.envShadow, 4, 6)).toBe(EMPTY_TILE); // mur od południa nie rzuca cienia na podłogę
  });

  it('sąsiednie bazy 1×1 (w poziomie i pionie) nigdy nie są tym samym kafelkiem', () => {
    const base = groupFrames(FLOOR_DRESSING.floorGroup);
    for (const floor of sampleFloors([1, 6], 3)) {
      const d = dress(floor);
      for (let y = 0; y < floor.height; y++) {
        for (let x = 0; x < floor.width; x++) {
          const f = at(d.floorBase, x, y);
          if (!base.has(f)) continue;
          if (x + 1 < floor.width) expect(at(d.floorBase, x + 1, y)).not.toBe(f);
          if (y + 1 < floor.height) expect(at(d.floorBase, x, y + 1)).not.toBe(f);
        }
      }
    }
  });

  it('wzory 2×2 leżą w całości, także odbite (części na właściwych miejscach)', () => {
    const d = dress(BOX, { ...NO_DECALS, macroChance: 1 });
    const macros = new Set(TILESET.groups[FLOOR_DRESSING.floorMacroGroup]);
    let found = 0;
    for (let y = 0; y < BOX.height; y++) {
      for (let x = 0; x < BOX.width; x++) {
        const part = TILE_BY_FRAME.get(at(d.floorBase, x, y));
        if (!part || !macros.has(part.name)) continue;
        found++;
        const tile = TILESET.tiles[part.name]!;
        const flip = flippedAt(d.floorBase, x, y);
        const ax = x - (flip ? tile.w - 1 - part.dx : part.dx);
        const ay = y - part.dy;
        for (let dy = 0; dy < tile.h; dy++) {
          for (let dx = 0; dx < tile.w; dx++) {
            expect(at(d.floorBase, ax + dx, ay + dy)).toBe(tile.frames![dy]![flip ? tile.w - 1 - dx : dx]);
            expect(flippedAt(d.floorBase, ax + dx, ay + dy)).toBe(flip);
          }
        }
      }
    }
    expect(found).toBe(16); // pokój 4×4 przy szansie 1 = cztery wzory 2×2
  });

  it('nakładki tylko na zwykłej podłodze, z dala od spawnu, schodów i krat', () => {
    const dense = { ...FLOOR_DRESSING, decalChance: 1 };
    const floors = [ARENA, ...sampleFloors([1, 4], 3)];
    for (const floor of floors) {
      const d = dress(floor, dense);
      const keyPoints = [floor.playerSpawn, ...stairsTiles(floor), ...d.gates];
      for (let y = 0; y < floor.height; y++) {
        for (let x = 0; x < floor.width; x++) {
          if (at(d.floorDecal, x, y) === EMPTY_TILE) continue;
          expect(floor.tiles[y * floor.width + x], `(${x},${y})`).toBe(TileType.Floor);
          for (const p of keyPoints) {
            const near = Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= FLOOR_DRESSING.clearRadius;
            expect(near, `nakładka (${x},${y}) przy (${p.x},${p.y})`).toBe(false);
          }
        }
      }
    }
  });

  it('przy szansie 1 nakładkę dostaje każdy wolny kafel zwykłej podłogi', () => {
    const d = dress(BOX, { ...NO_DECALS, decalChance: 1 });
    // Spawn w BOX to (0,0) — ściana, więc strefa wolna od nakładek nie obejmuje pokoju.
    for (let y = 3; y <= 6; y++) {
      for (let x = 3; x <= 6; x++) expect(at(d.floorDecal, x, y), `(${x},${y})`).not.toBe(EMPTY_TILE);
    }
  });

  it('kurz leży tylko od strony muru: północ, zachód, wschód', () => {
    const allDust: FloorDressingConfig = {
      ...NO_DECALS,
      dust: {
        north: { ...FLOOR_DRESSING.dust.north, chance: 1 },
        west: { ...FLOOR_DRESSING.dust.west, chance: 1 },
        east: { ...FLOOR_DRESSING.dust.east, chance: 1 },
      },
    };
    const d = dress(BOX, allDust);
    const dustN = groupFrames('decal.dustN');
    const dustW = groupFrames('decal.dustW');
    const dustE = groupFrames('decal.dustE');
    expect(dustN.has(at(d.floorDecal, 4, 3))).toBe(true);
    expect(dustN.has(at(d.floorDecal, 3, 3))).toBe(true); // północ ma pierwszeństwo w narożniku
    expect(dustW.has(at(d.floorDecal, 3, 5))).toBe(true);
    expect(dustE.has(at(d.floorDecal, 6, 5))).toBe(true);
    expect(at(d.floorDecal, 4, 5)).toBe(EMPTY_TILE); // środek pokoju
    expect(at(d.floorDecal, 4, 6)).toBe(EMPTY_TILE); // mur tylko od południa
  });

  it('długie pęknięcia zajmują oba kafle i nie wychodzą poza zwykłą podłogę', () => {
    const d = dress(BOX, { ...NO_DECALS, longCrackChance: 1 });
    const long = new Set(TILESET.groups[FLOOR_DRESSING.longCrackGroup]);
    let parts = 0;
    for (let y = 0; y < BOX.height; y++) {
      for (let x = 0; x < BOX.width; x++) {
        const part = TILE_BY_FRAME.get(at(d.floorDecal, x, y));
        if (!part || !long.has(part.name)) continue;
        parts++;
        expect(BOX.tiles[y * BOX.width + x]).toBe(TileType.Floor);
      }
    }
    expect(parts).toBeGreaterThan(0);
    expect(parts % 2).toBe(0);
  });

  it('gęstość nakładek na wygenerowanych piętrach jest umiarkowana', () => {
    for (const floor of sampleFloors([1, 7], 3)) {
      const d = dress(floor);
      let plain = 0;
      let decorated = 0;
      floor.tiles.forEach((t, i) => {
        if (t !== TileType.Floor) return;
        plain++;
        if (d.floorDecal.frames[i] !== EMPTY_TILE) decorated++;
      });
      expect(decorated / plain).toBeGreaterThan(0.05);
      expect(decorated / plain).toBeLessThan(0.35);
    }
  });
});

describe('FloorDressing — schody i kraty', () => {
  it('schody 2×2: zamknięte w warstwie elementów, klatki otwartych do podmiany', () => {
    const floor = floorFromAscii(['######', '#....#', '#.SS.#', '#.SS.#', '#....#', '######']);
    const d = dress(floor);
    const locked = TILESET.tiles[FLOOR_DRESSING.stairsTiles.locked]!;
    const open = TILESET.tiles[FLOOR_DRESSING.stairsTiles.open]!;
    expect(d.stairs.anchor).toEqual({ x: 2, y: 2 });
    expect(d.stairs.locked).toEqual(locked.frames);
    expect(d.stairs.open).toEqual(open.frames);
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const expected = isStairsTile(floor, { x, y }) ? locked.frames![y - 2]![x - 2] : EMPTY_TILE;
        expect(at(d.floorFeature, x, y)).toBe(expected);
      }
    }
  });

  it('kraty stoją na wejściach do areny; wejście z północy = pozioma, z zachodu = pionowa', () => {
    const d = dress(ARENA);
    const arena = ARENA.rooms[0]!;
    expect(d.gates.map((g) => ({ x: g.x, y: g.y }))).toEqual(findRoomEntrances(ARENA, arena));
    const byPos = new Map(d.gates.map((g) => [`${g.x},${g.y}`, g]));
    for (const key of ['4,2', '5,2']) expect(byPos.get(key)?.orientation).toBe('h');
    for (const key of ['1,4', '1,5']) expect(byPos.get(key)?.orientation).toBe('v');
    const h = byPos.get('4,2')!;
    expect(h.frames).toEqual({ open: frameOf('gate_h_open'), half: frameOf('gate_h_half'), closed: frameOf('gate_h_closed') });
    expect(gateOrientation(arena, { x: 4, y: 7 })).toBe('h');
    expect(gateOrientation(arena, { x: 8, y: 4 })).toBe('v');
  });

  it('pod kratą leży baza podłogi, ale nie ma nakładki', () => {
    const d = dress(ARENA, { ...FLOOR_DRESSING, decalChance: 1 });
    for (const g of d.gates) {
      expect(at(d.floorBase, g.x, g.y)).not.toBe(EMPTY_TILE);
      expect(at(d.floorDecal, g.x, g.y)).toBe(EMPTY_TILE);
    }
  });
});

describe('FloorDressing — determinizm i poprawność danych', () => {
  const floors = sampleFloors([1, 5, 10], 4);

  it('ten sam seed = identyczny wynik; inny seed = inna podłoga', () => {
    for (const floor of floors) {
      const a = dress(floor, FLOOR_DRESSING, 7);
      const b = dress(floor, FLOOR_DRESSING, 7);
      const c = dress(floor, FLOOR_DRESSING, 8);
      for (const [[name, la], [, lb]] of allLayers(a).map((l, i) => [l, allLayers(b)[i]!] as const)) {
        expect(Array.from(la.frames), name).toEqual(Array.from(lb.frames));
        expect(Array.from(la.flipX), name).toEqual(Array.from(lb.flipX));
      }
      expect(Array.from(c.floorBase.frames)).not.toEqual(Array.from(a.floorBase.frames));
    }
  });

  it('dekorowanie nie zmienia danych piętra (czysto wizualne)', () => {
    const floor = floors[0]!;
    const before = [...floor.tiles];
    dress(floor);
    expect([...floor.tiles]).toEqual(before);
  });

  it('każda klatka istnieje w arkuszu, a odbite są tylko kafle, które na to pozwalają', () => {
    const frameCount = TILESET.columns * TILESET.rows;
    for (const floor of floors) {
      for (const [name, layer] of allLayers(dress(floor))) {
        layer.frames.forEach((frame, i) => {
          if (frame === EMPTY_TILE) return;
          expect(frame, name).toBeGreaterThanOrEqual(0);
          expect(frame, name).toBeLessThan(frameCount);
          const owner = TILE_BY_FRAME.get(frame);
          expect(owner, `${name}: klatka ${frame} nie należy do żadnego kafla`).toBeDefined();
          if (layer.flipX[i] === 1) expect(TILESET.tiles[owner!.name]!.flipX, `${name}: ${owner!.name}`).toBe(true);
        });
      }
    }
  });

  it('konfiguracja wskazuje istniejące grupy i kafle arkusza', () => {
    const groups = [
      FLOOR_DRESSING.floorGroup,
      FLOOR_DRESSING.floorMacroGroup,
      FLOOR_DRESSING.longCrackGroup,
      ...Object.keys(FLOOR_DRESSING.decalGroupWeights),
      ...Object.values(FLOOR_DRESSING.dust).map((side) => side.group),
    ];
    for (const g of groups) expect(TILESET.groups, g).toHaveProperty(g);
    const names = [
      ...Object.values(FLOOR_DRESSING.stairsTiles),
      ...Object.values(FLOOR_DRESSING.gateTiles).flatMap((states) => Object.values(states)),
    ];
    for (const n of names) expect(TILESET.tiles, n).toHaveProperty(n);
  });

  it('niezgodny arkusz kończy się czytelnym błędem', () => {
    const wrongBits: TilesetMeta = {
      ...TILESET,
      autotile: { ...TILESET.autotile, wall: { ...TILESET.autotile.wall, bits: { N: 1, E: 2, S: 8, W: 4 } } },
    };
    expect(() => dressFloor(BOX, wrongBits, FLOOR_DRESSING, SEED)).toThrow(/bit S/);
    const noFloor: TilesetMeta = { ...TILESET, groups: { ...TILESET.groups, floor: [] } };
    expect(() => dressFloor(BOX, noFloor, FLOOR_DRESSING, SEED)).toThrow(/grupy „floor”/);
  });
});
