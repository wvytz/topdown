import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { planCocoons } from '@/dungeon/CocoonPlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { sampleFloors } from '../helpers/floors';

const CONFIG = BIOMES[BiomeId.SpiderLair].cocoons!;
const FLOORS = sampleFloors([2], 60);
const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('planCocoons — kokony w Pajęczym leżu (krok 23d)', () => {
  it('kokony stoją tylko na podłodze zwykłych pokojów, z dala od ścian i od środka pokoju', () => {
    FLOORS.forEach((floor, i) => {
      for (const tile of planCocoons(floor, CONFIG, createRng(i))) {
        const room = floor.rooms.find((r) => roomContainsTile(r, tile))!;
        expect(room.kind).toBe(RoomKind.Normal);
        expect(floor.tiles[tile.y * floor.width + tile.x]).toBe(TileType.Floor);
        const m = CONFIG.wallMarginTiles;
        expect(tile.x).toBeGreaterThanOrEqual(room.x + m);
        expect(tile.x).toBeLessThanOrEqual(room.x + room.width - 1 - m);
        expect(tile.y).toBeGreaterThanOrEqual(room.y + m);
        expect(tile.y).toBeLessThanOrEqual(room.y + room.height - 1 - m);
        const center = { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
        expect(chebyshev(tile, center)).toBeGreaterThan(CONFIG.centerClearTiles);
      }
    });
  });

  it('w pokoju mieści się w perRoom, kokony zachowują odstęp, a część pokojów jest bez kokonów', () => {
    let emptyRooms = 0;
    let fullRooms = 0;
    FLOORS.forEach((floor, i) => {
      const cocoons = planCocoons(floor, CONFIG, createRng(i));
      for (const room of floor.rooms.filter((r) => r.kind === RoomKind.Normal)) {
        const inRoom = cocoons.filter((c) => roomContainsTile(room, c));
        expect(inRoom.length).toBeLessThanOrEqual(CONFIG.perRoom.max);
        if (inRoom.length === 0) emptyRooms++;
        if (inRoom.length === CONFIG.perRoom.max) fullRooms++;
        for (const [a, b] of inRoom.flatMap((x, j) => inRoom.slice(j + 1).map((y) => [x, y] as const))) {
          expect(chebyshev(a, b)).toBeGreaterThanOrEqual(CONFIG.minSpacingTiles);
        }
      }
    });
    expect(emptyRooms).toBeGreaterThan(0);
    expect(fullRooms).toBeGreaterThan(0);
  });

  it('determinizm: ten sam seed daje te same miejsca', () => {
    const floor = FLOORS[0]!;
    expect(planCocoons(floor, CONFIG, createRng(5))).toEqual(planCocoons(floor, CONFIG, createRng(5)));
  });
});
