import { describe, expect, it } from 'vitest';
import { CURSED_CHEST_CONFIG } from '@/config/cursedChestConfig';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { CursedChestPhase, CursedChestState, curseRoster, curseSpawnTiles, pickAffixes, planCursedChest } from '@/systems/CursedChest';
import { sampleFloors } from '../helpers/floors';

describe('Przeklęta skrzynia — plan (krok U8b)', () => {
  it('stoi na posadzce zwykłego pokoju, z dala od kafli do ominięcia', () => {
    sampleFloors([3], 20).forEach((floor, i) => {
      const avoidRoom = floor.rooms.find((r) => r.kind === RoomKind.Normal)!;
      const avoid = [{ x: avoidRoom.x + 1, y: avoidRoom.y + 1 }];
      const plan = planCursedChest(floor, 3, CURSED_CHEST_CONFIG, createRng(i), avoid, true);
      if (!plan) return;
      const room = floor.rooms[plan.roomId]!;
      expect(room.kind).toBe(RoomKind.Normal);
      expect(room.id).not.toBe(avoidRoom.id);
      expect(floor.tiles[plan.tile.y * floor.width + plan.tile.x]).toBe(TileType.Floor);
    });
  });

  it('szansa wg piętra, wyłącznik i wymuszenie', () => {
    const floors = sampleFloors([1], 40);
    const count = floors.filter((f, i) => planCursedChest(f, 1, CURSED_CHEST_CONFIG, createRng(i), [])).length;
    expect(count).toBeGreaterThan(4);
    expect(count).toBeLessThan(26);
    expect(planCursedChest(floors[0]!, 4, { ...CURSED_CHEST_CONFIG, enabled: false }, createRng(1), [])).toBeNull();
    expect(planCursedChest(floors[0]!, 1, { ...CURSED_CHEST_CONFIG, enabled: false }, createRng(1), [], true)).not.toBeNull();
  });

  it('skład klątwy rośnie z piętrem, cechy bez powtórzeń', () => {
    expect(curseRoster(CURSED_CHEST_CONFIG, 1, createRng(1))).toHaveLength(2);
    expect(curseRoster(CURSED_CHEST_CONFIG, 6, createRng(1))).toHaveLength(3);
    const affixes = pickAffixes(['a', 'b', 'c'], 2, createRng(3));
    expect(new Set(affixes).size).toBe(2);
    expect(pickAffixes(['a'], 3, createRng(3))).toEqual(['a']);
  });

  it('pierścień wyjścia: posadzka w pokoju, równo po obwodzie', () => {
    const floor = sampleFloors([2], 1)[0]!;
    const plan = planCursedChest(floor, 2, CURSED_CHEST_CONFIG, createRng(5), [], true)!;
    const room = floor.rooms[plan.roomId]!;
    const tiles = curseSpawnTiles(floor, room, plan.tile, 2, 3);
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) {
      expect(Math.max(Math.abs(t.x - plan.tile.x), Math.abs(t.y - plan.tile.y))).toBe(2);
      expect(floor.tiles[t.y * floor.width + t.x]).toBe(TileType.Floor);
    }
  });
});

describe('Przeklęta skrzynia — stan', () => {
  it('otwarcie raz, klątwa zdjęta po wyjściu i wybiciu elit', () => {
    const chest = new CursedChestState();
    expect(chest.update(0, 0)).toBe(false); // zamknięta — nic
    expect(chest.open()).toBe(true);
    expect(chest.open()).toBe(false);
    expect(chest.update(2, 0)).toBe(false); // jeszcze wychodzą
    expect(chest.update(0, 1)).toBe(false);
    expect(chest.update(0, 0)).toBe(true);
    expect(chest.current).toBe(CursedChestPhase.Lifted);
    expect(chest.update(0, 0)).toBe(false);
  });
});
