import { describe, expect, it } from 'vitest';
import { EnemyType } from '@/core/combatTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { getEncounterConfigForFloor } from '@/config/combatConfig';
import { assignNesters, planEncounters } from '@/dungeon/EncounterPlanner';
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
    const nester = getEncounterConfigForFloor(1).nester;
    const onlyRushers = planEncounters(floor, { enemiesPerRoom: { min: 2, max: 2 }, kiterChance: 0, nester }, createRng(1));
    const onlyKiters = planEncounters(floor, { enemiesPerRoom: { min: 2, max: 2 }, kiterChance: 1, nester }, createRng(1));
    expect(onlyRushers.every((s) => s.type === EnemyType.Rusher)).toBe(true);
    expect(onlyKiters.every((s) => s.type === EnemyType.Kiter)).toBe(true);
  });

  it('jest deterministyczny dla tego samego seeda', () => {
    const floor = FLOORS[5]!;
    const config = getEncounterConfigForFloor(2);
    expect(planEncounters(floor, config, createRng(9))).toEqual(planEncounters(floor, config, createRng(9)));
  });
});

describe('assignNesters (krok 122)', () => {
  const always = { roomChance: 1, minRoomSide: 0, maxPerFloor: 99 };

  it('zamienia jednego wroga w pokoju w Gniazdownika — liczba wrogów i ich miejsca bez zmian', () => {
    FLOORS.forEach((floor, i) => {
      const spawns = planEncounters(floor, getEncounterConfigForFloor(3), createRng(i));
      const nested = assignNesters(floor, spawns, always, createRng(i));
      expect(nested.map((s) => s.tile)).toEqual(spawns.map((s) => s.tile));
      const rooms = new Set(spawns.map((s) => s.room));
      for (const room of rooms) {
        expect(nested.filter((s) => s.room === room && s.type === EnemyType.Nester)).toHaveLength(1);
      }
    });
  });

  it('pilnuje limitu na piętro i najkrótszego boku pokoju', () => {
    FLOORS.forEach((floor, i) => {
      const spawns = planEncounters(floor, getEncounterConfigForFloor(3), createRng(i));
      const config = { roomChance: 1, minRoomSide: 7, maxPerFloor: 2 };
      const nesters = assignNesters(floor, spawns, config, createRng(i)).filter((s) => s.type === EnemyType.Nester);
      expect(nesters.length).toBeLessThanOrEqual(2);
      for (const nester of nesters) {
        const room = floor.rooms.find((r) => r.id === nester.room)!;
        expect(Math.min(room.width, room.height)).toBeGreaterThanOrEqual(7);
      }
    });
  });

  it('szansa 0 nic nie zmienia; ten sam seed — te same gniazda', () => {
    const floor = FLOORS[2]!;
    const spawns = planEncounters(floor, getEncounterConfigForFloor(2), createRng(3));
    expect(assignNesters(floor, spawns, { ...always, roomChance: 0 }, createRng(1))).toEqual(spawns);
    const config = getEncounterConfigForFloor(2).nester;
    expect(assignNesters(floor, spawns, config, createRng(5))).toEqual(assignNesters(floor, spawns, config, createRng(5)));
  });

  it('w konfiguracji: gniazda co kilka pokojów, nie w każdym', () => {
    let rooms = 0;
    let nesters = 0;
    FLOORS.forEach((floor, i) => {
      const config = getEncounterConfigForFloor(3);
      const spawns = assignNesters(floor, planEncounters(floor, config, createRng(i)), config.nester, createRng(i + 100));
      rooms += new Set(spawns.map((s) => s.room)).size;
      nesters += spawns.filter((s) => s.type === EnemyType.Nester).length;
    });
    expect(nesters).toBeGreaterThan(0);
    expect(nesters / rooms).toBeLessThan(0.35);
  });
});
