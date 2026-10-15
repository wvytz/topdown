import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { planBreakables, planDartTraps, planSpikeStrips } from '@/dungeon/TrapPlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { sampleFloors } from '../helpers/floors';

const RUINS = BIOMES[BiomeId.TowerRuins];
const floors = sampleFloors([1], 30);
const isFloor = (f: (typeof floors)[number], t: { x: number; y: number }) => f.tiles[t.y * f.width + t.x] === TileType.Floor;

describe('planer pułapek ruin (krok 48)', () => {
  it('kolce: pas w poprzek zwykłego pokoju, grupy naprzemiennie, tylko na podłodze', () => {
    let total = 0;
    floors.forEach((floor, i) => {
      const plates = planSpikeStrips(floor, RUINS.traps!.spikes!, createRng(i));
      total += plates.length;
      for (const p of plates) {
        expect(isFloor(floor, p.tile)).toBe(true);
        expect(floor.rooms.find((r) => roomContainsTile(r, p.tile))?.kind).toBe(RoomKind.Normal);
      }
      for (let k = 1; k < plates.length; k++) {
        const a = plates[k - 1]!;
        const b = plates[k]!;
        if (Math.abs(a.tile.x - b.tile.x) + Math.abs(a.tile.y - b.tile.y) === 1) expect(a.group).not.toBe(b.group);
      }
    });
    expect(total).toBeGreaterThan(0);
  });

  it('strzałki: otwór w litym murze, linia przez pokój po podłodze, płyta na linii, z dala od kolców', () => {
    let total = 0;
    floors.forEach((floor, i) => {
      const spikes = planSpikeStrips(floor, RUINS.traps!.spikes!, createRng(i)).map((p) => p.tile);
      const traps = planDartTraps(floor, RUINS.traps!.darts!, createRng(100 + i), spikes);
      total += traps.length;
      for (const trap of traps) {
        expect(floor.tiles[trap.shooter.y * floor.width + trap.shooter.x]).toBe(TileType.Wall);
        expect(trap.line.length).toBeGreaterThanOrEqual(RUINS.traps!.darts!.minLine);
        expect(trap.line.every((t) => isFloor(floor, t))).toBe(true);
        expect(trap.line).toContainEqual(trap.plate);
        expect(trap.line.some((t) => spikes.some((s) => s.x === t.x && s.y === t.y))).toBe(false);
      }
    });
    expect(total).toBeGreaterThan(0);
  });

  it('urny i skrzynie: przy ścianach, nie przed wejściami, nie na pułapkach; deterministycznie', () => {
    floors.forEach((floor, i) => {
      const avoid = planSpikeStrips(floor, RUINS.traps!.spikes!, createRng(i)).map((p) => p.tile);
      const spots = planBreakables(floor, RUINS.breakables!, createRng(200 + i), avoid);
      for (const s of spots) {
        const room = floor.rooms.find((r) => roomContainsTile(r, s.tile))!;
        expect([RoomKind.Normal, RoomKind.Start]).toContain(room.kind);
        const onEdge = s.tile.x === room.x || s.tile.y === room.y || s.tile.x === room.x + room.width - 1 || s.tile.y === room.y + room.height - 1;
        expect(onEdge).toBe(true);
        for (const d of findRoomEntrances(floor, room)) expect(Math.max(Math.abs(d.x - s.tile.x), Math.abs(d.y - s.tile.y))).toBeGreaterThan(1);
        expect(avoid.some((a) => a.x === s.tile.x && a.y === s.tile.y)).toBe(false);
      }
      expect(planBreakables(floor, RUINS.breakables!, createRng(5), avoid)).toEqual(planBreakables(floor, RUINS.breakables!, createRng(5), avoid));
    });
  });
});
