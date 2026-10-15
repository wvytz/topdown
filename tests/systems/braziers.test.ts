import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { planBraziers } from '@/dungeon/BrazierPlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { BrazierPhase, brazierCycleIndex, brazierDamage, brazierState, brazierTimingForFloor } from '@/systems/Braziers';
import { floorFromAscii, sampleFloors } from '../helpers/floors';

const CONFIG = BIOMES[BiomeId.Infernal].braziers!;
const AT = { x: 100, y: 100 };

describe('Paleniska — tylko w Piekle (krok 41b)', () => {
  it('Piekło ma paleniska, inne biomy nie', () => {
    for (const biome of Object.values(BIOMES)) {
      expect(biome.braziers !== null, biome.id).toBe(biome.id === BiomeId.Infernal);
    }
  });

  it('rozmieszczenie: tylko podłoga zwykłych pokojów, 1–2 na pokój, w środkowym pasie pokoju', () => {
    const floors = sampleFloors([5], 30);
    let placed = 0;
    floors.forEach((floor, i) => {
      const braziers = planBraziers(floor, CONFIG, createRng(i));
      placed += braziers.length;
      for (const tile of braziers) {
        expect(floor.tiles[tile.y * floor.width + tile.x]).toBe(TileType.Floor);
        const room = floor.rooms.find((r) => roomContainsTile(r, tile))!;
        expect(room.kind).toBe(RoomKind.Normal);
        // środek pokoju w osi krótszego boku
        const cx = room.x + Math.floor(room.width / 2);
        const cy = room.y + Math.floor(room.height / 2);
        expect(tile.x === cx || tile.y === cy).toBe(true);
      }
      for (const room of floor.rooms) {
        expect(braziers.filter((t) => roomContainsTile(room, t)).length).toBeLessThanOrEqual(2);
      }
    });
    expect(placed).toBeGreaterThan(floors.length);
  });

  it('pokój z kapliczką i pokoje za wąskie zostają bez palenisk; deterministycznie z RNG', () => {
    const rooms = [
      { id: 0, x: 1, y: 1, width: 6, height: 6, kind: RoomKind.Normal },
      { id: 1, x: 8, y: 1, width: 4, height: 6, kind: RoomKind.Normal },
      { id: 2, x: 1, y: 8, width: 11, height: 5, kind: RoomKind.Normal },
    ];
    const rows = Array.from({ length: 14 }, (_, y) =>
      Array.from({ length: 13 }, (_, x) => (rooms.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) ? '.' : '#')).join(''),
    );
    const floor = floorFromAscii(rows, rooms);
    const always = { ...CONFIG, roomChance: 1 };
    const all = planBraziers(floor, always, createRng(1));
    expect(all.filter((t) => roomContainsTile(rooms[1]!, t))).toEqual([]); // krótszy bok 4 < 5
    expect(all.filter((t) => roomContainsTile(rooms[0]!, t))).toEqual([{ x: 4, y: 4 }]);
    expect(all.filter((t) => roomContainsTile(rooms[2]!, t))).toHaveLength(2); // dłuższy bok 11 ≥ 9
    const withShrine = planBraziers(floor, always, createRng(1), [{ x: 4, y: 4 }]);
    expect(withShrine.filter((t) => roomContainsTile(rooms[0]!, t))).toEqual([]);
    expect(planBraziers(floor, CONFIG, createRng(7))).toEqual(planBraziers(floor, CONFIG, createRng(7)));
  });
});

describe('cykl palenisk', () => {
  const timing = brazierTimingForFloor(CONFIG, 5);

  it('tli się, ostrzega, bucha — po kolei, w pętli', () => {
    expect(brazierState(timing, 0, 0).phase).toBe(BrazierPhase.Idle);
    expect(brazierState(timing, 0, timing.idleMs).phase).toBe(BrazierPhase.Warn);
    expect(brazierState(timing, 0, timing.idleMs + timing.warnMs).phase).toBe(BrazierPhase.Burst);
    const cycle = timing.idleMs + timing.warnMs + timing.burstMs;
    expect(brazierState(timing, 0, cycle).phase).toBe(BrazierPhase.Idle);
    expect(brazierState(timing, 0, timing.idleMs / 2).progress).toBeCloseTo(0.5);
  });

  it('numer cyklu stały przez całe buchnięcie (jedno trafienie na buchnięcie), rośnie co cykl', () => {
    const start = timing.idleMs + timing.warnMs;
    const end = start + timing.burstMs - 1;
    expect(brazierCycleIndex(timing, 0, start)).toBe(brazierCycleIndex(timing, 0, end));
    const cycle = timing.idleMs + timing.warnMs + timing.burstMs;
    expect(brazierCycleIndex(timing, 0, start + cycle)).toBe(brazierCycleIndex(timing, 0, start) + 1);
  });

  it('przesunięcie cyklu: dwa paleniska nie buchają razem', () => {
    const t = timing.idleMs + timing.warnMs;
    expect(brazierState(timing, 0, t).phase).toBe(BrazierPhase.Burst);
    expect(brazierState(timing, 2000, t).phase).not.toBe(BrazierPhase.Burst);
  });

  it('niezbyt szybkie tempo na piętrze 5; wyżej (goręcej) buchają częściej, ostrzeżenie zostaje', () => {
    expect(timing.idleMs).toBeGreaterThanOrEqual(3500);
    expect(timing.warnMs).toBeGreaterThanOrEqual(800);
    const hotter = brazierTimingForFloor(CONFIG, 6);
    expect(hotter.idleMs).toBeLessThan(timing.idleMs);
    expect(hotter.warnMs).toBe(timing.warnMs);
    expect(brazierTimingForFloor(CONFIG, 30).idleMs).toBe(CONFIG.minIdleMs);
  });

  it('parzy przy samej misie zawsze, a w buchnięciu w całym promieniu', () => {
    const idle = { phase: BrazierPhase.Idle, progress: 0 };
    const burst = { phase: BrazierPhase.Burst, progress: 0 };
    const near = { x: AT.x + CONFIG.contact.radius - 1, y: AT.y };
    const mid = { x: AT.x + CONFIG.burst.radius - 1, y: AT.y };
    const far = { x: AT.x + CONFIG.burst.radius + 5, y: AT.y };
    expect(brazierDamage(CONFIG, idle, AT, near)).toEqual(CONFIG.contact);
    expect(brazierDamage(CONFIG, idle, AT, mid)).toBeNull();
    expect(brazierDamage(CONFIG, burst, AT, mid)).toEqual(CONFIG.burst);
    expect(brazierDamage(CONFIG, burst, AT, near)).toEqual(CONFIG.burst);
    expect(brazierDamage(CONFIG, burst, AT, far)).toBeNull();
  });
});
