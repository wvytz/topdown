import { describe, expect, it } from 'vitest';
import { EnemyType } from '@/core/combatTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { getEncounterConfigForFloor } from '@/config/combatConfig';
import { planEncounters } from '@/dungeon/EncounterPlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { sampleFloors } from '../helpers/floors';

const FLOORS = sampleFloors([1, 3, 6], 40);

describe('planEncounters', () => {
  it('przeciwnicy stoją tylko na podłodze zwykłych pokojów (start i arena bossa puste)', () => {
    FLOORS.forEach((floor, i) => {
      for (const spawn of planEncounters(floor, getEncounterConfigForFloor(1), createRng(i))) {
        const room = floor.rooms.find((r) => roomContainsTile(r, spawn.tile));
        expect(room?.kind).toBe(RoomKind.Normal);
        expect(floor.tiles[spawn.tile.y * floor.width + spawn.tile.x]).toBe(TileType.Floor);
      }
    });
  });

  it('liczba przeciwników na pokój mieści się w konfiguracji', () => {
    const config = getEncounterConfigForFloor(3);
    FLOORS.forEach((floor, i) => {
      const spawns = planEncounters(floor, config, createRng(i));
      for (const room of floor.rooms.filter((r) => r.kind === RoomKind.Normal)) {
        const inRoom = spawns.filter((s) => roomContainsTile(room, s.tile)).length;
        expect(inRoom).toBeGreaterThanOrEqual(config.enemiesPerRoom.min);
        expect(inRoom).toBeLessThanOrEqual(config.enemiesPerRoom.max);
      }
    });
  });

  it('dwóch przeciwników nigdy nie startuje na tym samym kaflu', () => {
    FLOORS.forEach((floor, i) => {
      const keys = planEncounters(floor, getEncounterConfigForFloor(1), createRng(i)).map((s) => `${s.tile.x},${s.tile.y}`);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it('kiterChance steruje proporcją typów', () => {
    const floor = FLOORS[0]!;
    const onlyRushers = planEncounters(floor, { enemiesPerRoom: { min: 2, max: 2 }, kiterChance: 0 }, createRng(1));
    const onlyKiters = planEncounters(floor, { enemiesPerRoom: { min: 2, max: 2 }, kiterChance: 1 }, createRng(1));
    expect(onlyRushers.every((s) => s.type === EnemyType.Rusher)).toBe(true);
    expect(onlyKiters.every((s) => s.type === EnemyType.Kiter)).toBe(true);
  });

  it('jest deterministyczny dla tego samego seeda', () => {
    const floor = FLOORS[5]!;
    const config = getEncounterConfigForFloor(2);
    expect(planEncounters(floor, config, createRng(9))).toEqual(planEncounters(floor, config, createRng(9)));
  });
});
