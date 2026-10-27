import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { SECRET_ROOM_CONFIG } from '@/config/lootConfig';
import { getDungeonConfigForFloor } from '@/config/gameConfig';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { areaBounds, disguiseFloor, planTreasureCocoons, revealMask, secretArea } from '@/dungeon/SecretRoom';
import { planEncounters } from '@/dungeon/EncounterPlanner';
import { planShrineLocation } from '@/dungeon/ShrinePlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { getEncounterConfigForFloor } from '@/config/combatConfig';

const floorsWithSecret = Array.from({ length: 60 }, (_, i) => new DungeonGenerator(getDungeonConfigForFloor(2)).generate(i * 31 + 5)).filter(
  (f) => f.endRoomId !== undefined,
);

describe('ukryta komnata (krok 46)', () => {
  it('obszar: cała komnata i korytarz do areny, bez areny i reszty piętra', () => {
    expect(floorsWithSecret.length).toBeGreaterThan(10);
    for (const floor of floorsWithSecret) {
      const area = secretArea(floor)!;
      const room = area.room;
      for (let y = room.y; y < room.y + room.height; y++) {
        for (let x = room.x; x < room.x + room.width; x++) expect(area.tiles.has(y * floor.width + x)).toBe(true);
      }
      const arena = floor.rooms[floor.bossRoomId]!;
      for (const i of area.tiles) {
        expect(floor.tiles[i]).not.toBe(TileType.Wall);
        expect(roomContainsTile(arena, { x: i % floor.width, y: Math.floor(i / floor.width) })).toBe(false);
      }
      // Korytarz styka się z areną (komnata osiągalna).
      const touchesArena = [...area.tiles].some((i) => {
        const x = i % floor.width;
        const y = Math.floor(i / floor.width);
        return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => roomContainsTile(arena, { x: x + dx!, y: y + dy! }));
      });
      expect(touchesArena).toBe(true);
    }
  });

  it('przebranie: komnata to mur, reszta bez zmian; maska odsłania w promieniu 2 kafli', () => {
    const floor = floorsWithSecret[0]!;
    const area = secretArea(floor)!;
    const disguised = disguiseFloor(floor, area);
    disguised.tiles.forEach((t, i) => expect(t).toBe(area.tiles.has(i) ? TileType.Wall : floor.tiles[i]));
    const mask = revealMask(floor, area, 2);
    const some = [...area.tiles][0]!;
    const x = some % floor.width;
    const y = Math.floor(some / floor.width);
    expect(mask[y * floor.width + x]).toBe(1);
    expect(mask[(y + 2) * floor.width + x + 2]).toBe(1);
    // Kafel 3 dalej od całego obszaru nie odsłania.
    const b = areaBounds(floor, area, 0);
    const far = { x: b.x - 3, y: b.y - 3 };
    if (far.x >= 0 && far.y >= 0) expect(mask[far.y * floor.width + far.x]).toBe(0);
  });

  it('komnata nie dostaje wrogów ani kapliczki', () => {
    for (const floor of floorsWithSecret) {
      const room = floor.rooms[floor.endRoomId!]!;
      expect(room.kind).toBe(RoomKind.Secret);
      for (const spawn of planEncounters(floor, getEncounterConfigForFloor(3), createRng(1))) {
        expect(roomContainsTile(room, spawn.tile)).toBe(false);
      }
      const shrine = planShrineLocation(floor, createRng(2));
      if (shrine) expect(roomContainsTile(room, shrine)).toBe(false);
    }
  });

  it('kokony skarbu: różne kafle w komnacie z odstępem od ścian, dokładnie jeden z przedmiotem', () => {
    for (const floor of floorsWithSecret) {
      const room = floor.rooms[floor.endRoomId!]!;
      const plan = planTreasureCocoons(room, SECRET_ROOM_CONFIG, createRng(floor.seed));
      expect(plan.tiles.length).toBeGreaterThanOrEqual(SECRET_ROOM_CONFIG.cocoons.min);
      expect(plan.tiles.length).toBeLessThanOrEqual(SECRET_ROOM_CONFIG.cocoons.max);
      expect(new Set(plan.tiles.map((t) => `${t.x},${t.y}`)).size).toBe(plan.tiles.length);
      for (const t of plan.tiles) {
        expect(t.x).toBeGreaterThanOrEqual(room.x + 1);
        expect(t.x).toBeLessThan(room.x + room.width - 1);
      }
      expect(plan.prize).toBeGreaterThanOrEqual(0);
      expect(plan.prize).toBeLessThan(plan.tiles.length);
    }
  });
});
