import { describe, expect, it } from 'vitest';
import type { DungeonFloor } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { TilesetMeta } from '@/core/tilesetTypes';
import type { FloorDressingConfig } from '@/config/dressingConfig';
import { FLOOR_DRESSING, FUNGAL_GROVE_DRESSING, GRAVEYARD_DRESSING, INFERNAL_DRESSING, SPIDER_LAIR_DRESSING } from '@/config/dressingConfig';
import type { DressedFloor, DressedLayer, DressingExtras } from '@/dungeon/FloorDressing';
import { EMPTY_TILE, dressFloor, gateOrientation, wallDistances } from '@/dungeon/FloorDressing';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { isStairsTile, stairsTiles } from '@/dungeon/stairs';
import { floorFromAscii, room, sampleFloors } from '../helpers/floors';
import { loadTileset } from '../helpers/tileset';

const TILESET = loadTileset();
const SEED = 1234;

/** Pokój 4×4 otoczony murem grubości 3 — do sprawdzania masek, pasm i cieni kafel po kaflu. */
const BOX = floorFromAscii(
  [
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
  ],
  [room(0, 3, 3, 4, 4, RoomKind.Normal)],
);

/**
 * Sala z przejściami: od północy szerokości 2 (łuk), od południa szerokości 3 (bez łuku),
 * korytarz na zachód; pokój to prostokąt x 2–11, y 3–6. Bez areny bossa (brak krat na wejściach).
 */
const HALLS: DungeonFloor = {
  ...floorFromAscii(
    [
      '##############',
      '####..########',
      '####..########',
      '##..........##',
      '............##',
      '............##',
      '##..........##',
      '#######...####',
      '#######...####',
      '##############',
    ],
    [room(0, 2, 3, 10, 4, RoomKind.Normal)],
  ),
  bossRoomId: -1,
};

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
const dress = (floor: DungeonFloor, config: FloorDressingConfig = FLOOR_DRESSING, seed = SEED, extras: DressingExtras = {}) =>
  dressFloor(floor, TILESET, config, seed, extras);

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
    const dense = { ...FLOOR_DRESSING, decalChance: 1, nest: null };
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

  it('duże nakładki biomu (Cmentarzysko: płyty 1×2, zwłoki 2×1) leżą w całości na zwykłej podłodze', () => {
    const grave = loadTileset('graveyard_tileset.json');
    const byFrame = new Map<number, string>();
    for (const [name, t] of Object.entries(grave.tiles)) for (const f of (t.frames ?? [[t.frame]]).flat()) byFrame.set(f, name);
    const large = new Set((GRAVEYARD_DRESSING.largeDecals ?? []).flatMap(({ group }) => grave.groups[group] ?? []));
    let cells = 0;
    for (const floor of sampleFloors([4], 6)) {
      const d = dressFloor(floor, grave, GRAVEYARD_DRESSING, SEED);
      floor.tiles.forEach((t, i) => {
        const name = byFrame.get(d.floorDecal.frames[i]!);
        if (!name || !large.has(name)) return;
        cells++;
        expect(t).toBe(TileType.Floor);
      });
    }
    expect(cells).toBeGreaterThan(0);
  });

  it('biom bez dużych nakładek dekoruje się tak samo jak przed krokiem 32a (te same losowania)', () => {
    const floor = sampleFloors([1], 1)[0]!;
    const before = dressFloor(floor, TILESET, FLOOR_DRESSING, SEED);
    const withEmpty = dressFloor(floor, TILESET, { ...FLOOR_DRESSING, largeDecals: [] }, SEED);
    expect(withEmpty.floorDecal.frames).toEqual(before.floorDecal.frames);
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

describe('FloorDressing — krok 19b: bruk, lico, łuki, pajęczyny', () => {
  const cobble = groupFrames(FLOOR_DRESSING.corridorGroup);
  const slabs = new Set([...groupFrames(FLOOR_DRESSING.floorGroup), ...groupFrames(FLOOR_DRESSING.floorMacroGroup)]);
  const noCobwebs: FloorDressingConfig = { ...FLOOR_DRESSING, cobweb: { ...FLOOR_DRESSING.cobweb, chance: 0 } };
  const allCobwebs: FloorDressingConfig = { ...FLOOR_DRESSING, cobweb: { ...FLOOR_DRESSING.cobweb, chance: 1 } };

  it('korytarze (poza pokojami) mają bruk, pokoje płyty', () => {
    const d = dress(HALLS);
    const r = HALLS.rooms[0]!;
    for (let y = 0; y < HALLS.height; y++) {
      for (let x = 0; x < HALLS.width; x++) {
        if (HALLS.tiles[y * HALLS.width + x] === TileType.Wall) continue;
        const inside = x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
        expect((inside ? slabs : cobble).has(at(d.floorBase, x, y)), `(${x},${y})`).toBe(true);
      }
    }
  });

  it('łuk tylko nad przejściem szerokości 2 (północ), nie nad szerokim (południe) ani bocznym', () => {
    const arch = TILESET.tiles.arch_2x1!;
    const d = dress(HALLS, noCobwebs);
    expect(at(d.overheadDecor, 4, 2)).toBe(arch.frames![0]![0]);
    expect(at(d.overheadDecor, 5, 2)).toBe(arch.frames![0]![1]);
    const decorated: string[] = [];
    d.overheadDecor.frames.forEach((f, i) => {
      if (f !== EMPTY_TILE) decorated.push(`${i % HALLS.width},${Math.floor(i / HALLS.width)}`);
    });
    expect(decorated.sort()).toEqual(['4,2', '5,2']);
  });

  it('łuki i pajęczyny leżą wyłącznie nad podłogą — nigdy na ścianie (bez kolizji)', () => {
    for (const floor of [HALLS, ...sampleFloors([1, 5], 4)]) {
      const d = dress(floor, allCobwebs);
      d.overheadDecor.frames.forEach((f, i) => {
        if (f !== EMPTY_TILE) expect(floor.tiles[i], `kafel ${i}`).not.toBe(TileType.Wall);
      });
    }
  });

  it('bez łuków nad kratami areny (nadproże zasłoniłoby pręty)', () => {
    const arena = floorFromAscii(
      ['##########', '####..####', '##......##', '##......##', '##########'],
      [room(0, 2, 2, 6, 2, RoomKind.Boss)],
    );
    const d = dress(arena);
    expect(d.gates.map((g) => `${g.x},${g.y}`).sort()).toEqual(['4,1', '5,1']);
    expect(at(d.overheadDecor, 4, 1)).toBe(EMPTY_TILE);
    expect(at(d.overheadDecor, 5, 1)).toBe(EMPTY_TILE);
  });

  it('pajęczyny w górnych narożnikach pokoju (przy szansie 1)', () => {
    const d = dress(BOX, allCobwebs);
    expect(at(d.overheadDecor, 3, 3)).toBe(frameOf('cobweb_nw'));
    expect(at(d.overheadDecor, 6, 3)).toBe(frameOf('cobweb_ne'));
    expect(at(d.overheadDecor, 3, 6)).toBe(EMPTY_TILE);
  });

  it('detale lica: tylko proste odcinki górnej ściany, nigdy na pochodni ani obok niej', () => {
    const everywhere: FloorDressingConfig = { ...FLOOR_DRESSING, wallFace: { ...FLOOR_DRESSING.wallFace, chance: 1 } };
    const d = dress(HALLS, everywhere, SEED, { torches: [{ x: 8, y: 2 }] });
    const faces = groupFrames(FLOOR_DRESSING.wallFace.group);
    const wall = (x: number, y: number) =>
      x < 0 || y < 0 || x >= HALLS.width || y >= HALLS.height || HALLS.tiles[y * HALLS.width + x] === TileType.Wall;
    const roomTopWall: number[] = [];
    d.wallDecor.frames.forEach((f, i) => {
      if (f === EMPTY_TILE) return;
      const x = i % HALLS.width;
      const y = Math.floor(i / HALLS.width);
      expect(faces.has(f)).toBe(true);
      // Reguła: prosty odcinek muru (mur z północy, wschodu i zachodu), pod spodem podłoga, z dala od pochodni.
      expect(wall(x, y) && wall(x, y - 1) && wall(x - 1, y) && wall(x + 1, y), `(${x},${y})`).toBe(true);
      expect(HALLS.tiles[(y + 1) * HALLS.width + x]).toBe(TileType.Floor);
      expect(y === 2 && Math.abs(x - 8) <= 1, `(${x},${y}) przy pochodni`).toBe(false);
      if (y === 2) roomTopWall.push(x);
    });
    // Górna ściana pokoju: lico nad podłogą mają kolumny 2–3 i 6–11; 3 i 6 sąsiadują z przejściem
    // (mur nie ciągnie się w bok), 7–9 to pochodnia i jej sąsiedzi.
    expect(roomTopWall).toEqual([2, 10, 11]);
  });

  it('wyłomy i gruz to najwyżej 10% wagi zwykłych nakładek (−60% w kroku 19b)', () => {
    const weights = FLOOR_DRESSING.decalGroupWeights;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    const heavy = (weights['decal.broken'] ?? 0) + (weights['decal.rubble'] ?? 0);
    expect(heavy / total).toBeLessThanOrEqual(0.1);
  });

  it('nowe grupy z konfiguracji istnieją; łuki i pajęczyny w warstwie overheadDecor, detale lica w wallDecor', () => {
    const { corridorGroup, wallFace, archGroup, cobweb, combatDecals } = FLOOR_DRESSING;
    for (const g of [corridorGroup, wallFace.group, archGroup, cobweb.nwGroup, cobweb.neGroup, ...Object.values(combatDecals.groups)]) {
      expect(TILESET.groups, g).toHaveProperty(g);
    }
    for (const g of [archGroup, cobweb.nwGroup, cobweb.neGroup]) {
      for (const name of TILESET.groups[g]!) expect(TILESET.tiles[name]!.layer, name).toBe('overheadDecor');
    }
    for (const name of TILESET.groups[wallFace.group]!) expect(TILESET.tiles[name]!.layer).toBe('wallDecor');
  });
});

describe('FloorDressing — gniazdo bossa pająków (krok 52)', () => {
  const LAIR = loadTileset('spider_lair_tileset.json');
  const lairFrame = (name: string) => LAIR.tiles[name]!.frame;
  // Arena (pokój 0, x 3–6) i pokój daleko na prawo (x 40–43).
  const wide = (): DungeonFloor => {
    const pad = (n: number) => '#'.repeat(n);
    const row = (a: string, b: string) => `###${a}${pad(33)}${b}###`;
    return floorFromAscii(
      [
        pad(47),
        pad(47),
        pad(47),
        row('....', '....'),
        row('....', '....'),
        row('....', '....'),
        row('....', '....'),
        pad(47),
        pad(47),
        pad(47),
      ],
      [room(0, 3, 3, 4, 4, RoomKind.Boss), room(1, 40, 3, 4, 4, RoomKind.Normal)],
    );
  };
  const quiet: FloorDressingConfig = {
    ...SPIDER_LAIR_DRESSING,
    cobweb: { ...SPIDER_LAIR_DRESSING.cobweb, chance: 0 },
    wallFace: { ...SPIDER_LAIR_DRESSING.wallFace, chance: 0 },
  };
  const nest = { radiusTiles: 10, cobwebChance: 1, corridorCobwebChance: 0, wallFaceChance: 1, wallFaceGroup: 'wallFace.lair', decals: null, trail: null };

  it('przy arenie pajęczyny w narożnikach nawet przy zerowej szansie bazowej; daleki pokój bez zmian', () => {
    const d = dressFloor(wide(), LAIR, { ...quiet, nest }, SEED);
    expect(at(d.overheadDecor, 3, 3)).toBe(lairFrame('cobweb_nw'));
    expect(at(d.overheadDecor, 6, 3)).toBe(lairFrame('cobweb_ne'));
    expect(at(d.overheadDecor, 40, 3)).toBe(EMPTY_TILE);
    expect(at(d.overheadDecor, 43, 3)).toBe(EMPTY_TILE);
    const none = dressFloor(wide(), LAIR, { ...quiet, nest: null }, SEED);
    expect(at(none.overheadDecor, 3, 3)).toBe(EMPTY_TILE);
  });

  it('nici i jaja na licu muru tylko w zasięgu gniazda', () => {
    const d = dressFloor(wide(), LAIR, { ...quiet, nest }, SEED);
    const lair = new Set(LAIR.groups['wallFace.lair']!.map(lairFrame));
    const near = [3, 4, 5, 6].filter((x) => lair.has(at(d.wallDecor, x, 2)));
    expect(near.length).toBeGreaterThan(0);
    for (let x = 38; x < 46; x++) expect(at(d.wallDecor, x, 2), `x=${x}`).toBe(EMPTY_TILE);
  });

  it('korytarz przed areną: pajęczyny pod górnym murem, gęstsze ku arenie, daleko żadnych (krok 53)', () => {
    const wall = '#'.repeat(40);
    // Arena (x 3–6, y 3–6) i korytarz szerokości 2 (y 3–4) na prawo od niej, do x = 39.
    const floor = floorFromAscii(
      [wall, wall, wall, `###....${'.'.repeat(33)}`, `###....${'.'.repeat(33)}`, `###....###${'#'.repeat(30)}`, `###....###${'#'.repeat(30)}`, wall, wall],
      [room(0, 3, 3, 4, 4, RoomKind.Boss)],
    );
    const cfg = { ...quiet, nest: { ...nest, radiusTiles: 20, cobwebChance: 0, corridorCobwebChance: 1 } };
    const d = dressFloor(floor, LAIR, cfg, SEED);
    const web = (x: number) => [lairFrame('cobweb_nw'), lairFrame('cobweb_ne')].includes(at(d.overheadDecor, x, 3));
    const near = Array.from({ length: 6 }, (_, i) => 7 + i).filter(web).length;
    expect(near).toBeGreaterThan(0);
    for (let x = 30; x < 40; x++) expect(web(x), `x=${x}`).toBe(false);
    for (let x = 7; x < 40; x++) expect(at(d.overheadDecor, x, 4), `dolny wiersz x=${x}`).toBe(EMPTY_TILE);
    expect(dressFloor(floor, LAIR, { ...cfg, nest: { ...cfg.nest!, corridorCobwebChance: 0 } }, SEED).overheadDecor.frames.some((f) => f !== EMPTY_TILE)).toBe(false);
  });

  it('konfiguracja: gniazdo w leżu, Grzybni, Cmentarzysku i Piekle; pajęczyny tylko u pająków', () => {
    for (const config of [SPIDER_LAIR_DRESSING, FUNGAL_GROVE_DRESSING]) expect(config.nest!.cobwebChance).toBeGreaterThan(0);
    for (const config of [GRAVEYARD_DRESSING, INFERNAL_DRESSING]) {
      expect(config.nest).not.toBeNull();
      expect(config.nest!.cobwebChance).toBe(0);
      expect(config.nest!.corridorCobwebChance).toBe(0);
      expect(config.nest!.wallFaceGroup).toBe(config.wallFace.group);
    }
    // Ruiny: bez pajęczyn i lica, ale ze śladami i plamami ku arenie (krok 54).
    expect(FLOOR_DRESSING.nest!.cobwebChance).toBe(0);
    expect(FLOOR_DRESSING.nest!.trail).not.toBeNull();
  });

  it('gęstość pajęczyn rośnie ku arenie (piętra z gniazdem mają ich więcej niż bez)', () => {
    const count = (config: FloorDressingConfig) => {
      let n = 0;
      for (const floor of sampleFloors([2, 3], 6)) {
        const d = dressFloor(floor, LAIR, config, SEED);
        d.overheadDecor.frames.forEach((f) => {
          if (f === lairFrame('cobweb_nw') || f === lairFrame('cobweb_ne')) n++;
        });
      }
      return n;
    };
    expect(count(SPIDER_LAIR_DRESSING)).toBeGreaterThan(count({ ...SPIDER_LAIR_DRESSING, nest: null }));
  });

  it('ślady wleczenia prowadzą do areny: tylko na podłodze, nigdy w arenie ani przy spawnie, gęstsze przy wejściu (krok 54)', () => {
    const GRAVE = loadTileset('graveyard_tileset.json');
    const trailFrames = new Set(['decal.trailH', 'decal.trailV', 'decal.trailDrop'].flatMap((g) => GRAVE.groups[g]!.map((n) => GRAVE.tiles[n]!.frame)));
    let near = 0;
    let far = 0;
    for (const floor of sampleFloors([4, 5, 6], 6)) {
      const arena = floor.rooms[floor.bossRoomId]!;
      const d = dressFloor(floor, GRAVE, GRAVEYARD_DRESSING, SEED);
      for (let y = 0; y < floor.height; y++) {
        for (let x = 0; x < floor.width; x++) {
          if (!trailFrames.has(at(d.floorDecal, x, y))) continue;
          expect(floor.tiles[y * floor.width + x], `(${x},${y})`).toBe(TileType.Floor);
          expect(x >= arena.x && x < arena.x + arena.width && y >= arena.y && y < arena.y + arena.height, `w arenie (${x},${y})`).toBe(false);
          expect(Math.max(Math.abs(x - floor.playerSpawn.x), Math.abs(y - floor.playerSpawn.y)), `przy spawnie (${x},${y})`).toBeGreaterThan(2);
          const dist = Math.hypot(Math.max(arena.x - x, 0, x - (arena.x + arena.width - 1)), Math.max(arena.y - y, 0, y - (arena.y + arena.height - 1)));
          if (dist <= 6) near++;
          else far++;
        }
      }
    }
    expect(near).toBeGreaterThan(10);
    expect(near).toBeGreaterThan(far * 0.3); // ślad kończy się w pobliżu areny — większość jest blisko niej
    const none = { ...GRAVEYARD_DRESSING, nest: { ...GRAVEYARD_DRESSING.nest!, trail: null } };
    const floor = sampleFloors([4], 1)[0]!;
    const d = dressFloor(floor, GRAVE, none, SEED);
    expect(d.floorDecal.frames.some((f) => trailFrames.has(f))).toBe(false);
  });

  it('stosy kości (Cmentarzysko) gęstnieją ku arenie', () => {
    const GRAVE = loadTileset('graveyard_tileset.json');
    const bones = new Set(GRAVE.groups['decal.bones']!.map((n) => GRAVE.tiles[n]!.frame));
    const count = (config: FloorDressingConfig) => {
      let n = 0;
      for (const floor of sampleFloors([4], 8)) {
        const d = dressFloor(floor, GRAVE, config, SEED);
        d.floorDecal.frames.forEach((f) => {
          if (!bones.has(f)) return;
          n++;
        });
      }
      return n;
    };
    expect(count(GRAVEYARD_DRESSING)).toBeGreaterThan(count({ ...GRAVEYARD_DRESSING, nest: null }));
  });
});
