import { describe, expect, it } from 'vitest';
import { RoomKind } from '@/core/dungeonTypes';
import type { Room, TilePoint } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { AMBUSH_CONFIG, AMBUSH_FORMATION_TEXT, AMBUSH_SCENARIOS } from '@/config/ambushConfig';
import { AmbushFormation, formationTiles, pickScenario, waveSize } from '@/systems/AmbushWaves';

const room: Room = { id: 0, x: 10, y: 10, width: 9, height: 7, kind: RoomKind.Normal };
const center: TilePoint = { x: 14, y: 13 };
const inside = (t: TilePoint) => t.x > room.x && t.y > room.y && t.x < room.x + room.width - 1 && t.y < room.y + room.height - 1;
const dist = (a: TilePoint, b: TilePoint) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const key = (t: TilePoint) => `${t.x},${t.y}`;

describe('ustalone fale zasadzki (krok 164)', () => {
  it('każdy scenariusz ma 3 fale, różne szyki i rozsądną liczbę wrogów', () => {
    expect(AMBUSH_SCENARIOS.length).toBeGreaterThanOrEqual(6);
    for (const scenario of AMBUSH_SCENARIOS) {
      expect(scenario.waves).toHaveLength(3);
      expect(new Set(scenario.waves.map((w) => w.formation)).size).toBeGreaterThanOrEqual(2);
      for (const wave of scenario.waves) {
        expect(waveSize(wave)).toBeGreaterThanOrEqual(3);
        expect(waveSize(wave)).toBeLessThanOrEqual(7);
        expect(wave.mobs ?? 0).toBeLessThanOrEqual(2);
      }
    }
    for (const f of Object.values(AmbushFormation)) expect(AMBUSH_FORMATION_TEXT[f]).toBeTruthy();
  });

  it('wybór scenariusza zależy od seeda i jest deterministyczny', () => {
    expect(pickScenario(AMBUSH_SCENARIOS, createRng(5))).toBe(pickScenario(AMBUSH_SCENARIOS, createRng(5)));
    const names = new Set(Array.from({ length: 40 }, (_, i) => pickScenario(AMBUSH_SCENARIOS, createRng(i)).name));
    expect(names.size).toBeGreaterThan(3);
  });

  for (const formation of Object.values(AmbushFormation)) {
    it(`szyk ${formation}: tyle kafli, ile trzeba, różne, w pokoju, nie na graczu`, () => {
      for (const count of [4, 6, 7]) {
        const tiles = formationTiles(room, center, formation, count, AMBUSH_CONFIG.minSpawnDistance, createRng(count));
        expect(tiles).toHaveLength(count);
        expect(new Set(tiles.map(key)).size).toBe(count);
        for (const t of tiles) {
          expect(inside(t)).toBe(true);
          expect(dist(t, center)).toBeGreaterThanOrEqual(1);
        }
      }
    });
  }

  it('pierścień otacza gracza: kafle w jednym promieniu, z obu stron', () => {
    const tiles = formationTiles(room, center, AmbushFormation.Ring, 6, 2, createRng(1));
    expect(new Set(tiles.map((t) => dist(t, center))).size).toBe(1);
    expect(tiles.some((t) => t.x < center.x)).toBe(true);
    expect(tiles.some((t) => t.x > center.x)).toBe(true);
  });

  it('szereg stoi pod ścianą najdalszą od gracza, kleszcze z dwóch stron', () => {
    const player = { x: 12, y: 13 };
    const wall = formationTiles(room, player, AmbushFormation.Wall, 4, 3, createRng(1));
    expect(wall.every((t) => t.x === room.x + room.width - 2)).toBe(true);
    const pincer = formationTiles(room, center, AmbushFormation.Pincer, 4, 2, createRng(1));
    expect(pincer.filter((t) => t.x < center.x)).toHaveLength(2);
    expect(pincer.filter((t) => t.x > center.x)).toHaveLength(2);
  });
});
