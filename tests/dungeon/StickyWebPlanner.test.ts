import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { planCocoons } from '@/dungeon/CocoonPlanner';
import { planStickyWebs } from '@/dungeon/StickyWebPlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { webGap } from '@/systems/StickyWebs';
import type { StickyWeb } from '@/systems/StickyWebs';
import { sampleFloors } from '../helpers/floors';

const LAIR = BIOMES[BiomeId.SpiderLair];
const CONFIG = LAIR.stickyWebs!;
const FLOORS = sampleFloors([2], 60);

const tilesOf = ({ tile, size }: StickyWeb) =>
  Array.from({ length: size * size }, (_, i) => ({ x: tile.x + (i % size), y: tile.y + Math.floor(i / size) }));

function plan(i: number) {
  const floor = FLOORS[i]!;
  const cocoons = planCocoons(floor, LAIR.cocoons!, createRng(i));
  return { floor, cocoons, webs: planStickyWebs(floor, CONFIG, createRng(1000 + i), cocoons) };
}

describe('planStickyWebs — lepkie pajęczyny w Pajęczym leżu (krok 23e)', () => {
  it('cała pajęczyna leży na podłodze jednego zwykłego pokoju, z dala od ścian i od środka', () => {
    FLOORS.forEach((_, i) => {
      const { floor, webs } = plan(i);
      for (const web of webs) {
        const room = floor.rooms.find((r) => roomContainsTile(r, web.tile))!;
        expect(room.kind).toBe(RoomKind.Normal);
        const m = CONFIG.wallMarginTiles;
        for (const t of tilesOf(web)) {
          expect(floor.tiles[t.y * floor.width + t.x]).toBe(TileType.Floor);
          expect(t.x).toBeGreaterThanOrEqual(room.x + m);
          expect(t.x).toBeLessThanOrEqual(room.x + room.width - 1 - m);
          expect(t.y).toBeGreaterThanOrEqual(room.y + m);
          expect(t.y).toBeLessThanOrEqual(room.y + room.height - 1 - m);
        }
        const center = { tile: { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) }, size: 1 as const };
        expect(webGap(web, center)).toBeGreaterThanOrEqual(CONFIG.centerClearTiles);
      }
    });
  });

  it('limit na pokój, przerwa od innych pajęczyn i od kokonów; są oba rozmiary i pokoje bez pajęczyn', () => {
    const sizes = new Set<number>();
    let emptyRooms = 0;
    FLOORS.forEach((_, i) => {
      const { floor, cocoons, webs } = plan(i);
      webs.forEach((web, j) => {
        sizes.add(web.size);
        for (const other of webs.slice(j + 1)) expect(webGap(web, other)).toBeGreaterThanOrEqual(CONFIG.minGapTiles);
        for (const tile of cocoons) expect(webGap(web, { tile, size: 1 })).toBeGreaterThanOrEqual(CONFIG.minGapTiles);
      });
      for (const room of floor.rooms.filter((r) => r.kind === RoomKind.Normal)) {
        const inRoom = webs.filter((w) => roomContainsTile(room, w.tile)).length;
        expect(inRoom).toBeLessThanOrEqual(CONFIG.perRoom.max);
        if (inRoom === 0) emptyRooms++;
      }
    });
    expect([...sizes].sort()).toEqual([1, 2]);
    expect(emptyRooms).toBeGreaterThan(0);
  });

  it('determinizm: ten sam seed daje te same pajęczyny', () => {
    expect(plan(3).webs).toEqual(plan(3).webs);
  });
});
