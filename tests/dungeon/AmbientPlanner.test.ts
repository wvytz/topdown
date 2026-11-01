import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { AmbientKind, GRAVEYARD_AMBIENT, GROVE_AMBIENT } from '@/config/ambientConfig';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { AMBIENT_VARIANTS, isWallSpot, planAmbient } from '@/dungeon/AmbientPlanner';
import { sampleFloors } from '../helpers/floors';

const GROVE = { grove: GROVE_AMBIENT, graveyard: null };
const GRAVE = { grove: null, graveyard: GRAVEYARD_AMBIENT };
const FLOORS = sampleFloors([2, 3], 40);
const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const WALL_KINDS = new Set([AmbientKind.Glowcap, AmbientKind.OvergrownLamp, AmbientKind.Candle]);

describe('planAmbient — żywe otoczenie Grzybni i Cmentarzyska (krok 156)', () => {
  it('Grzybnia i Cmentarzysko mają żywe otoczenie (Piekło i mieszkanie — od kroku 157), ruiny i areny 6–7 nie', () => {
    expect(BIOMES[BiomeId.FungalGrove].ambient?.grove).toBeTruthy();
    expect(BIOMES[BiomeId.Graveyard].ambient?.graveyard).toBeTruthy();
    expect(BIOMES[BiomeId.Infernal].ambient?.infernal).toBeTruthy();
    expect(BIOMES[BiomeId.SmokeDen].ambient?.den).toBeTruthy();
    for (const id of [BiomeId.TowerRuins, BiomeId.MirrorHall, BiomeId.StorkGarden]) expect(BIOMES[id].ambient ?? null).toBeNull();
  });

  it('rekwizyty stoją na podłodze pokoju startowego albo zwykłego, nie na środku, nie przy schodach i starcie', () => {
    FLOORS.forEach((floor, i) => {
      for (const config of [GROVE, GRAVE]) {
        for (const spot of planAmbient(floor, config, createRng(i))) {
          const room = floor.rooms[spot.roomId]!;
          expect([RoomKind.Start, RoomKind.Normal]).toContain(room.kind);
          expect(floor.tiles[spot.tile.y * floor.width + spot.tile.x]).toBe(TileType.Floor);
          expect(spot.tile.x).toBeGreaterThanOrEqual(room.x);
          expect(spot.tile.x).toBeLessThan(room.x + room.width);
          expect(spot.tile.y).toBeGreaterThanOrEqual(room.y);
          expect(spot.tile.y).toBeLessThan(room.y + room.height);
          const center = { x: room.x + Math.floor(room.width / 2), y: room.y + Math.floor(room.height / 2) };
          expect(chebyshev(spot.tile, center)).toBeGreaterThan(1);
          expect(chebyshev(spot.tile, floor.stairs)).toBeGreaterThan(1);
          expect(chebyshev(spot.tile, floor.playerSpawn)).toBeGreaterThan(1);
          expect(spot.variant).toBeLessThan(AMBIENT_VARIANTS[spot.kind]);
        }
      }
    });
  });

  it('kępy, lampy i znicze stoją pod murem, ale nie w przejściu; kruki i ogniki w głębi pokoju', () => {
    FLOORS.forEach((floor, i) => {
      for (const config of [GROVE, GRAVE]) {
        for (const spot of planAmbient(floor, config, createRng(i))) {
          const room = floor.rooms[spot.roomId]!;
          if (WALL_KINDS.has(spot.kind)) expect(isWallSpot(floor, room, spot.tile, 1)).toBe(true);
          else expect(isWallSpot(floor, room, spot.tile, 1)).toBe(false);
        }
      }
    });
  });

  it('omija kafle z listy (kapliczka, kryjówki Czyhaczy) razem z sąsiadami', () => {
    const floor = FLOORS[0]!;
    const free = planAmbient(floor, GRAVE, createRng(5));
    const avoid = free.slice(0, 3).map((s) => s.tile);
    for (const spot of planAmbient(floor, GRAVE, createRng(5), avoid)) {
      for (const tile of avoid) expect(chebyshev(spot.tile, tile)).toBeGreaterThan(1);
    }
  });

  it('jest deterministyczny i daje rozsądną gęstość: kilka kęp na pokój w Grzybni, znicze w każdym pokoju Cmentarzyska', () => {
    const floor = FLOORS[3]!;
    expect(planAmbient(floor, GROVE, createRng(9))).toEqual(planAmbient(floor, GROVE, createRng(9)));
    let glowcaps = 0;
    let candles = 0;
    let ravens = 0;
    let rooms = 0;
    FLOORS.forEach((f, i) => {
      rooms += f.rooms.filter((r) => r.kind === RoomKind.Normal || r.kind === RoomKind.Start).length;
      const grove = planAmbient(f, GROVE, createRng(i));
      const grave = planAmbient(f, GRAVE, createRng(i));
      glowcaps += grove.filter((s) => s.kind === AmbientKind.Glowcap).length;
      candles += grave.filter((s) => s.kind === AmbientKind.Candle).length;
      ravens += grave.filter((s) => s.kind === AmbientKind.Raven).length;
    });
    expect(glowcaps / rooms).toBeGreaterThan(1.5);
    expect(candles / rooms).toBeGreaterThan(1);
    expect(ravens).toBeGreaterThan(0);
  });

  it('część zniczy jest wypalona, ćmy tylko w Grzybni', () => {
    const all = FLOORS.flatMap((f, i) => planAmbient(f, { grove: GROVE_AMBIENT, graveyard: GRAVEYARD_AMBIENT }, createRng(i)));
    const candles = all.filter((s) => s.kind === AmbientKind.Candle);
    expect(candles.some((s) => !s.lit)).toBe(true);
    expect(candles.filter((s) => s.lit).length).toBeGreaterThan(candles.length / 2);
    expect(all.filter((s) => s.moths > 0).every((s) => s.kind === AmbientKind.Glowcap || s.kind === AmbientKind.OvergrownLamp)).toBe(true);
  });
});
