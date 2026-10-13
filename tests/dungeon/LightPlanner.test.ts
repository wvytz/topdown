import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { DungeonFloor } from '@/core/dungeonTypes';
import { TORCH_PLACEMENT } from '@/config/lightingConfig';
import { planTorches } from '@/dungeon/LightPlanner';
import { floorFromAscii, room, sampleFloors } from '../helpers/floors';

const isWall = (f: DungeonFloor, x: number, y: number) =>
  x < 0 || y < 0 || x >= f.width || y >= f.height || f.tiles[y * f.width + x] === TileType.Wall;

/** Szeroki pokój z wejściem od północy (korytarz w kolumnach 6–7). */
const HALL = floorFromAscii(
  [
    '################',
    '######..########',
    '#..............#',
    '#..............#',
    '#..............#',
    '################',
  ],
  [room(0, 1, 2, 14, 3, RoomKind.Normal)],
);

describe('planTorches', () => {
  it('pochodnie tylko na prostych odcinkach górnej ściany, nad zwykłą podłogą', () => {
    const torches = planTorches(HALL, { minSpacing: 1, maxPerRoom: 99, maxPerBossRoom: 99 }, 1);
    const xs = torches.map((t) => t.x).sort((a, b) => a - b);
    // Kolumny 5 i 8 sąsiadują z wejściem (mur nie ciągnie się w bok), 6–7 to korytarz.
    expect(xs).toEqual([1, 2, 3, 4, 9, 10, 11, 12, 13, 14]);
    for (const t of torches) {
      expect(t.y).toBe(1);
      expect(isWall(HALL, t.x, t.y)).toBe(true);
      expect(isWall(HALL, t.x, t.y + 1)).toBe(false);
    }
  });

  it('limit na pokój i minimalny odstęp', () => {
    const torches = planTorches(HALL, { minSpacing: 4, maxPerRoom: 3, maxPerBossRoom: 3 }, 7);
    expect(torches.length).toBeLessThanOrEqual(3);
    for (const a of torches) {
      for (const b of torches) {
        if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(4);
      }
    }
  });

  const floors = sampleFloors([1, 4, 8], 6);

  it('na wygenerowanych piętrach: reguły ściany, odstęp i limity pokojów', () => {
    for (const floor of floors) {
      const torches = planTorches(floor, TORCH_PLACEMENT, floor.seed);
      expect(torches.length).toBeGreaterThan(0);
      const perRoom = new Map<number, number>();
      for (const t of torches) {
        expect(isWall(floor, t.x, t.y)).toBe(true);
        expect(isWall(floor, t.x, t.y - 1) && isWall(floor, t.x - 1, t.y) && isWall(floor, t.x + 1, t.y)).toBe(true);
        expect(floor.tiles[(t.y + 1) * floor.width + t.x]).toBe(TileType.Floor);
        perRoom.set(t.roomId, (perRoom.get(t.roomId) ?? 0) + 1);
      }
      for (const [roomId, count] of perRoom) {
        const limit = floor.rooms[roomId]!.kind === RoomKind.Boss ? TORCH_PLACEMENT.maxPerBossRoom : TORCH_PLACEMENT.maxPerRoom;
        expect(count).toBeLessThanOrEqual(limit);
      }
      for (const a of torches) {
        for (const b of torches) {
          if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(TORCH_PLACEMENT.minSpacing);
        }
      }
    }
  });

  it('deterministyczne: ten sam seed = te same pochodnie; dane piętra nietknięte', () => {
    const floor = floors[0]!;
    const before = [...floor.tiles];
    expect(planTorches(floor, TORCH_PLACEMENT, 5)).toEqual(planTorches(floor, TORCH_PLACEMENT, 5));
    expect([...floor.tiles]).toEqual(before);
  });
});
