import { describe, expect, it } from 'vitest';
import { TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { THRONE_ROOM } from '@/config/dressingConfig';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import { ThroneDecalKind, chebyshev, planThroneDecals } from '@/dungeon/ThronePlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { sampleFloors } from '../helpers/floors';

const floors = sampleFloors([4], 30);
const isFloor = (floor: (typeof floors)[number], x: number, y: number) => floor.tiles[y * floor.width + x] === TileType.Floor;

describe('sala tronowa Pożeracza (krok 39): naklejki podłogi', () => {
  const config = THRONE_ROOM.decals;

  it('na podłodze areny, z odstępem, poza środkiem; liczba w zakresie', () => {
    floors.forEach((floor, i) => {
      const arena = floor.rooms[floor.bossRoomId]!;
      const decals = planThroneDecals(floor, arena, config, createRng(i));
      expect(decals.length).toBeLessThanOrEqual(config.count.max);
      expect(decals.length).toBeGreaterThanOrEqual(config.count.min);
      const center = { x: arena.x + Math.floor(arena.width / 2), y: arena.y + Math.floor(arena.height / 2) };
      for (const d of decals) {
        expect(roomContainsTile(arena, d.tile)).toBe(true);
        expect(isFloor(floor, d.tile.x, d.tile.y)).toBe(true);
        expect(chebyshev(d.tile, center)).toBeGreaterThan(config.centerClearTiles);
        for (const o of decals) if (o !== d) expect(chebyshev(d.tile, o.tile)).toBeGreaterThanOrEqual(config.minSpacingTiles);
      }
    });
  });

  it('rodzaje z wag; ten sam seed = te same naklejki', () => {
    const floor = floors[0]!;
    const arena = floor.rooms[floor.bossRoomId]!;
    const kinds = new Set<ThroneDecalKind>();
    for (let i = 0; i < 40; i++) for (const d of planThroneDecals(floor, arena, config, createRng(i))) kinds.add(d.kind);
    expect(kinds.size).toBe(config.weights.length);
    expect(planThroneDecals(floor, arena, config, createRng(3))).toEqual(planThroneDecals(floor, arena, config, createRng(3)));
  });

  it('wagi odpowiadają kolumnom arkusza naklejek', () => {
    const sheet = SPRITE_SHEETS.throneDecals;
    expect(config.weights.length).toBe(sheet.sheetWidth / sheet.frameWidth);
  });
});
