import { describe, expect, it } from 'vitest';
import { ArenaSide } from '@/core/arenaConditionTypes';
import type { TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { MIRROR_HALL_ARENA, STORK_GARDEN_ARENA } from '@/config/arenaConditionsConfig';
import { STAIRS_SIZE } from '@/config/gameConfig';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { planArenaLayout, pickAbyssSide } from '@/dungeon/ArenaConditionPlanner';
import { sampleFloors } from '../helpers/floors';

const key = (t: TilePoint): string => `${t.x},${t.y}`;
const cheb = (a: TilePoint, b: TilePoint): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('rozmieszczenie zmiennych warunków areny (krok 160)', () => {
  const floors = sampleFloors([6, 7], 25);

  it('nic nie stoi przy wejściu ani na schodach, elementy się nie nakładają', () => {
    for (const floor of floors) {
      const arena = floor.rooms[floor.bossRoomId]!;
      const entrances = findRoomEntrances(floor, arena);
      for (const config of [MIRROR_HALL_ARENA, STORK_GARDEN_ARENA]) {
        const layout = planArenaLayout(floor, arena, config, createRng(floor.seed));
        const all = [...layout.rubble, ...layout.buckets, ...layout.mirrors, ...layout.pillars];
        const solid = [...layout.rubble, ...layout.buckets, ...layout.mirrors, ...layout.pillars].map(key);
        expect(new Set(solid).size).toBe(solid.length);
        for (const tile of all) {
          expect(floor.tiles[tile.y * floor.width + tile.x]).toBe(TileType.Floor);
          for (const e of entrances) expect(cheb(e, tile)).toBeGreaterThan(2);
          for (let dy = 0; dy < STAIRS_SIZE; dy++) {
            for (let dx = 0; dx < STAIRS_SIZE; dx++) expect(cheb({ x: floor.stairs.x + dx, y: floor.stairs.y + dy }, tile)).toBeGreaterThan(1);
          }
        }
      }
    }
  });

  it('Lustrzana komnata: gruz po obu bokach (wschód — faza 1, zachód — faza 2), butle w murze fazy 1, 2 lustra i 2 wiadra', () => {
    for (const floor of floors) {
      const arena = floor.rooms[floor.bossRoomId]!;
      const layout = planArenaLayout(floor, arena, MIRROR_HALL_ARENA, createRng(floor.seed));
      expect(layout.rubble.some((r) => r.phase === 1)).toBe(true);
      expect(layout.rubble.some((r) => r.phase === 2)).toBe(true);
      for (const r of layout.rubble) {
        const east = r.x >= arena.x + arena.width - 2;
        expect(r.phase).toBe(east ? 1 : 2);
        expect(r.y).toBeGreaterThan(arena.y);
        expect(r.y).toBeLessThan(arena.y + arena.height - 1);
      }
      const phase1 = new Set(layout.rubble.filter((r) => r.phase === 1).map(key));
      for (const b of layout.bottles) expect(phase1.has(key(b))).toBe(true);
      expect(layout.mirrors).toHaveLength(2);
      expect(layout.buckets.length).toBeGreaterThan(0);
      expect(layout.pillars).toHaveLength(0);
      expect(layout.abyss).toBeNull();
    }
  });

  it('Bociani Ogród: 2 słupy symetrycznie, z dala od murów; taras nad bokiem bez wejścia', () => {
    for (const floor of floors) {
      const arena = floor.rooms[floor.bossRoomId]!;
      const layout = planArenaLayout(floor, arena, STORK_GARDEN_ARENA, createRng(floor.seed));
      expect(layout.pillars).toHaveLength(2);
      const [a, b] = layout.pillars;
      expect(a!.x + b!.x).toBe(arena.x * 2 + arena.width - 1);
      for (const p of layout.pillars) {
        expect(p.x - arena.x).toBeGreaterThanOrEqual(2);
        expect(arena.x + arena.width - 1 - p.x).toBeGreaterThanOrEqual(2);
      }
      expect(layout.rubble).toHaveLength(0);
      const side = layout.abyss;
      expect(side).not.toBeNull();
      const entrances = findRoomEntrances(floor, arena);
      if (side === ArenaSide.South) expect(entrances.some((e) => e.y === arena.y + arena.height)).toBe(false);
      if (side === ArenaSide.East) expect(entrances.some((e) => e.x === arena.x + arena.width)).toBe(false);
      if (side === ArenaSide.West) expect(entrances.some((e) => e.x === arena.x - 1)).toBe(false);
      expect(pickAbyssSide(floor, arena)).toBe(side);
    }
  });

  it('to samo ziarno — ten sam układ', () => {
    const floor = floors[0]!;
    const arena = floor.rooms[floor.bossRoomId]!;
    expect(planArenaLayout(floor, arena, MIRROR_HALL_ARENA, createRng(5))).toEqual(planArenaLayout(floor, arena, MIRROR_HALL_ARENA, createRng(5)));
  });
});
