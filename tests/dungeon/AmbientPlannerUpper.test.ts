import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { AmbientKind, DEN_AMBIENT, INFERNAL_AMBIENT } from '@/config/ambientConfig';
import { AMBIENT_VARIANTS, isWallSpot, planAmbient } from '@/dungeon/AmbientPlanner';
import { sampleFloors } from '../helpers/floors';

const HELL = { grove: null, graveyard: null, infernal: INFERNAL_AMBIENT, den: null };
const DEN = { grove: null, graveyard: null, infernal: null, den: DEN_AMBIENT };
const FLOORS = sampleFloors([4, 5], 40);
const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('planAmbient — Piekło i mieszkanie gracza (krok 157)', () => {
  it('rekwizyty na podłodze pokoju startowego albo zwykłego, z dala od środka, schodów i startu', () => {
    FLOORS.forEach((floor, i) => {
      for (const config of [HELL, DEN]) {
        for (const spot of planAmbient(floor, config, createRng(i))) {
          const room = floor.rooms[spot.roomId]!;
          expect([RoomKind.Start, RoomKind.Normal]).toContain(room.kind);
          expect(floor.tiles[spot.tile.y * floor.width + spot.tile.x]).toBe(TileType.Floor);
          const center = { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
          expect(chebyshev(spot.tile, center)).toBeGreaterThan(1);
          expect(chebyshev(spot.tile, floor.stairs)).toBeGreaterThan(1);
          expect(chebyshev(spot.tile, floor.playerSpawn)).toBeGreaterThan(1);
          expect(spot.variant).toBeLessThan(AMBIENT_VARIANTS[spot.kind]);
        }
      }
    });
  });

  it('ekrany stoją pod murem (nie w przejściu); szczeliny, chrząszcze, karaluchy i puszki w głębi pokoju', () => {
    FLOORS.forEach((floor, i) => {
      for (const config of [HELL, DEN]) {
        for (const spot of planAmbient(floor, config, createRng(i))) {
          const room = floor.rooms[spot.roomId]!;
          expect(isWallSpot(floor, room, spot.tile, 1)).toBe(spot.kind === AmbientKind.Screen);
        }
      }
    });
  });

  it('Piekło ma szczeliny w każdym pokoju i czasem chrząszcze; mieszkanie — ekrany (część czarnych), karaluchy i puszki', () => {
    let rooms = 0;
    const hell: AmbientKind[] = [];
    const den: { kind: AmbientKind; lit: boolean }[] = [];
    FLOORS.forEach((f, i) => {
      rooms += f.rooms.filter((r) => r.kind === RoomKind.Normal || r.kind === RoomKind.Start).length;
      hell.push(...planAmbient(f, HELL, createRng(i)).map((s) => s.kind));
      den.push(...planAmbient(f, DEN, createRng(i)));
    });
    expect(hell.filter((k) => k === AmbientKind.LavaVent).length / rooms).toBeGreaterThan(1);
    expect(hell).toContain(AmbientKind.CinderBeetle);
    const screens = den.filter((s) => s.kind === AmbientKind.Screen);
    expect(screens.length / rooms).toBeGreaterThan(0.8);
    expect(screens.some((s) => !s.lit)).toBe(true);
    expect(screens.filter((s) => s.lit).length).toBeGreaterThan(screens.length / 2);
    expect(den.some((s) => s.kind === AmbientKind.Roach)).toBe(true);
    expect(den.some((s) => s.kind === AmbientKind.Can)).toBe(true);
    // Każdy biom tylko swoje rekwizyty.
    expect(hell.every((k) => k === AmbientKind.LavaVent || k === AmbientKind.CinderBeetle)).toBe(true);
  });

  it('jest deterministyczny', () => {
    const floor = FLOORS[2]!;
    expect(planAmbient(floor, DEN, createRng(4))).toEqual(planAmbient(floor, DEN, createRng(4)));
    expect(planAmbient(floor, HELL, createRng(4))).toEqual(planAmbient(floor, HELL, createRng(4)));
  });
});
