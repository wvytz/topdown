import { describe, expect, it } from 'vitest';
import { TileType } from '@/core/dungeonTypes';
import type { DungeonFloor, Room } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { getDungeonConfigForFloor } from '@/config/gameConfig';
import { SPIDER_VAULT_CONFIG } from '@/config/spiderVaultConfig';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { secretArea } from '@/dungeon/SecretRoom';
import type { SecretArea } from '@/dungeon/SecretRoom';
import { VaultSide, isInVault, pedestalTile, planVaultDecor, planVaultLayout, threadPixels, vaultEntrance } from '@/dungeon/SpiderVault';

const vaults = Array.from({ length: 80 }, (_, i) => new DungeonGenerator(getDungeonConfigForFloor(2)).generate(i * 37 + 11))
  .filter((f) => f.endRoomId !== undefined)
  .map((floor) => ({ floor, area: secretArea(floor)! }));

const inRoom = (r: Room, x: number, y: number) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

/** Komnata z ręki: pokój 8×7 i korytarz od strony `side`. */
function handmade(side: VaultSide): { floor: DungeonFloor; area: SecretArea } {
  const width = 20;
  const height = 20;
  const room: Room = { id: 0, x: 6, y: 6, width: 8, height: 7, kind: 'secret' as Room['kind'] };
  const tiles = new Array<TileType>(width * height).fill(TileType.Wall);
  const set = new Set<number>();
  for (let y = room.y; y < room.y + room.height; y++) for (let x = room.x; x < room.x + room.width; x++) set.add(y * width + x);
  const corridor = { [VaultSide.North]: [9, 5], [VaultSide.South]: [9, 13], [VaultSide.West]: [5, 9], [VaultSide.East]: [14, 9] }[side];
  set.add(corridor[1]! * width + corridor[0]!);
  for (const i of set) tiles[i] = TileType.Floor;
  const floor = { width, height, tiles, rooms: [room], bossRoomId: 0, seed: 1 } as unknown as DungeonFloor;
  return { floor, area: { room, tiles: set } };
}

describe('skarbiec pająków (krok U4d)', () => {
  it('wejście: strona korytarza do komnaty', () => {
    for (const side of [VaultSide.North, VaultSide.South, VaultSide.East, VaultSide.West]) {
      const { floor, area } = handmade(side);
      expect(vaultEntrance(floor, area).side).toBe(side);
    }
    expect(vaults.length).toBeGreaterThan(10);
    for (const { floor, area } of vaults) {
      const door = vaultEntrance(floor, area).tile;
      expect(area.tiles.has(door.y * floor.width + door.x)).toBe(true);
      expect(inRoom(area.room, door.x, door.y)).toBe(false);
    }
  });

  it('piedestały: wielki naprzeciw wejścia na osi, pary symetryczne, w komnacie z odstępem od ścian, różne kafle', () => {
    for (const { floor, area } of vaults) {
      const r = area.room;
      const layout = planVaultLayout(floor, area, SPIDER_VAULT_CONFIG, createRng(floor.seed));
      const grand = layout.pedestals.filter((p) => p.grand);
      expect(grand).toHaveLength(1);
      const others = layout.pedestals.filter((p) => !p.grand);
      expect(others.length % 2).toBe(0);
      expect(others.length / 2).toBeLessThanOrEqual(SPIDER_VAULT_CONFIG.pedestalPairs.max);
      // Komnaty Grzybni mają co najmniej 5 kafli boku — mieści się wielki i jedna para.
      expect(others.length).toBeGreaterThanOrEqual(2);
      const across = layout.entrance === VaultSide.North || layout.entrance === VaultSide.South;
      const axis = across ? r.x + r.width / 2 : r.y + r.height / 2;
      expect(across ? grand[0]!.at.x : grand[0]!.at.y).toBeCloseTo(axis);
      // Wielki stoi w rzędzie najdalszym od wejścia (z odstępem od ściany).
      const m = SPIDER_VAULT_CONFIG.wallMargin;
      const far = { [VaultSide.South]: r.y + m + 0.5, [VaultSide.North]: r.y + r.height - m - 0.5, [VaultSide.East]: r.x + m + 0.5, [VaultSide.West]: r.x + r.width - m - 0.5 }[layout.entrance];
      expect(across ? grand[0]!.at.y : grand[0]!.at.x).toBeCloseTo(far);
      // Każdy zwykły ma lustrzane odbicie względem osi.
      for (const p of others) {
        const mirror = others.find((q) => (across ? Math.abs(q.at.x - (2 * axis - p.at.x)) < 1e-9 && q.at.y === p.at.y : Math.abs(q.at.y - (2 * axis - p.at.y)) < 1e-9 && q.at.x === p.at.x));
        expect(mirror).toBeDefined();
      }
      const tiles = layout.pedestals.map(pedestalTile);
      expect(new Set(tiles.map((t) => `${t.x},${t.y}`)).size).toBe(tiles.length);
      for (const t of tiles) {
        expect(t.x).toBeGreaterThanOrEqual(r.x + m);
        expect(t.x).toBeLessThan(r.x + r.width - m);
        expect(t.y).toBeGreaterThanOrEqual(r.y + m);
        expect(t.y).toBeLessThan(r.y + r.height - m);
      }
      expect(layout.prize).toBeGreaterThanOrEqual(0);
      expect(layout.prize).toBeLessThan(layout.pedestals.length);
    }
  });

  it('piedestały nie stoją w rzędzie przy wejściu ani na kaflu tuż przed wejściem', () => {
    for (const side of [VaultSide.North, VaultSide.South, VaultSide.East, VaultSide.West]) {
      const { floor, area } = handmade(side);
      const door = vaultEntrance(floor, area).tile;
      for (let seed = 0; seed < 20; seed++) {
        const layout = planVaultLayout(floor, area, SPIDER_VAULT_CONFIG, createRng(seed));
        for (const t of layout.pedestals.map(pedestalTile)) expect(Math.abs(t.x - door.x) + Math.abs(t.y - door.y)).toBeGreaterThan(1);
      }
    }
  });

  it('układ i nagroda nie zależą od ozdób (osobne strumienie), ozdoby deterministyczne', () => {
    const { floor, area } = vaults[0]!;
    const a = planVaultLayout(floor, area, SPIDER_VAULT_CONFIG, createRng(5));
    const b = planVaultLayout(floor, area, SPIDER_VAULT_CONFIG, createRng(5));
    expect(b).toEqual(a);
    const d1 = planVaultDecor(floor, area, a, SPIDER_VAULT_CONFIG, createRng(9));
    const d2 = planVaultDecor(floor, area, a, SPIDER_VAULT_CONFIG, createRng(9));
    expect(d2).toEqual(d1);
  });

  it('oplot: gęsty jedwab (więcej przy ścianach), śluz, sieci, zasłony na murze, ciała przy ścianach bocznych', () => {
    for (const { floor, area } of vaults) {
      const r = area.room;
      const layout = planVaultLayout(floor, area, SPIDER_VAULT_CONFIG, createRng(floor.seed));
      const decor = planVaultDecor(floor, area, layout, SPIDER_VAULT_CONFIG, createRng(floor.seed + 1));
      const roomTiles = r.width * r.height;
      const j = SPIDER_VAULT_CONFIG.silkJitter;
      const silkInRoom = decor.silk.filter((d) => inRoom(r, Math.floor(d.at.x), Math.floor(d.at.y)));
      expect(silkInRoom.length).toBeGreaterThan(roomTiles * 0.5);
      // Środek płatu najwyżej `silkJitter` od środka kafla obszaru komnaty.
      for (const d of decor.silk) {
        const tx = Math.round(d.at.x - 0.5);
        const ty = Math.round(d.at.y - 0.5);
        expect(area.tiles.has(ty * floor.width + tx)).toBe(true);
        expect(Math.abs(d.at.x - (tx + 0.5))).toBeLessThanOrEqual(j + 1e-9);
      }
      for (const d of decor.silk) expect(d.variant).toBeLessThan(SPIDER_VAULT_CONFIG.silkVariants);
      expect(decor.slime.length).toBeGreaterThanOrEqual(SPIDER_VAULT_CONFIG.slimePools.min);
      expect(decor.slime.length).toBeLessThanOrEqual(SPIDER_VAULT_CONFIG.slimePools.max);
      for (const d of decor.slime) expect(inRoom(r, Math.floor(d.at.x), Math.floor(d.at.y))).toBe(true);
      expect(decor.corners.length).toBeGreaterThanOrEqual(3);
      for (const c of decor.curtains) {
        expect(c.at.y).toBe(r.y - 1);
        expect(floor.tiles[c.at.y * floor.width + c.at.x]).toBe(TileType.Wall);
      }
      const pedestalTiles = layout.pedestals.map(pedestalTile);
      for (const h of decor.husks) {
        const tx = Math.floor(h.at.x);
        expect(tx === r.x || tx === r.x + r.width - 1).toBe(true);
        expect(pedestalTiles.some((t) => t.x === tx && t.y === Math.floor(h.at.y))).toBe(false);
      }
      // Nici: co najmniej dwie na piedestał, końce w komnacie albo na jej obwodzie.
      expect(decor.threads.length).toBeGreaterThanOrEqual(layout.pedestals.length * 2);
      for (const t of decor.threads) {
        for (const p of [t.from, t.to]) {
          expect(p.x).toBeGreaterThanOrEqual(r.x);
          expect(p.x).toBeLessThanOrEqual(r.x + r.width);
          expect(p.y).toBeGreaterThanOrEqual(r.y);
          expect(p.y).toBeLessThanOrEqual(r.y + r.height);
        }
      }
    }
  });

  it('spowolnienie: na kaflach komnaty i korytarza do niej, poza nimi nie', () => {
    const { floor, area } = vaults[0]!;
    const r = area.room;
    expect(isInVault(area, floor.width, { x: (r.x + 0.5) * 32, y: (r.y + 0.5) * 32 }, 32)).toBe(true);
    const door = vaultEntrance(floor, area).tile;
    expect(isInVault(area, floor.width, { x: (door.x + 0.5) * 32, y: (door.y + 0.5) * 32 }, 32)).toBe(true);
    const arena = floor.rooms[floor.bossRoomId]!;
    expect(isInVault(area, floor.width, { x: (arena.x + 1.5) * 32, y: (arena.y + 1.5) * 32 }, 32)).toBe(false);
    expect(isInVault(area, floor.width, { x: -5, y: 10 }, 32)).toBe(false);
  });

  it('nić: ciągła linia 1 px od końca do końca, bez powtórzeń, z ugięciem w dół', () => {
    for (const [from, to, sag] of [
      [{ x: 3, y: 4 }, { x: 90, y: 30 }, 6],
      [{ x: 50, y: 10 }, { x: 10, y: 70 }, 0],
      [{ x: 0, y: 0 }, { x: 0, y: 0 }, 2],
      [{ x: 20, y: 50 }, { x: 21, y: 5 }, 10],
    ] as const) {
      const px = threadPixels(from, to, sag);
      expect(px[0]).toEqual(from);
      expect(px[px.length - 1]).toEqual(to);
      expect(new Set(px.map((p) => `${p.x},${p.y}`)).size).toBe(px.length);
      for (let i = 1; i < px.length; i++) expect(Math.max(Math.abs(px[i]!.x - px[i - 1]!.x), Math.abs(px[i]!.y - px[i - 1]!.y))).toBeLessThanOrEqual(1);
    }
    const sagging = threadPixels({ x: 0, y: 0 }, { x: 100, y: 0 }, 8);
    expect(sagging.find((p) => p.x === 50)!.y).toBeGreaterThan(4);
  });
});
