import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { planWallDogs } from '@/dungeon/WallDogPlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { WallDogPhase, WallDogState } from '@/systems/WallDogs';
import { sampleFloors } from '../helpers/floors';

const CONFIG = BIOMES[BiomeId.SmokeDen].wallDogs!;
const FLOORS = sampleFloors([7], 60);
const at = (floor: { width: number; tiles: readonly TileType[] }, t: { x: number; y: number }) => floor.tiles[t.y * floor.width + t.x];

describe('planWallDogs — psy w ścianach palarni (krok 84)', () => {
  it('pies jest w murze zwykłego pokoju, między kaflami muru, z podłogą przed sobą; nie więcej niż limit', () => {
    let total = 0;
    FLOORS.forEach((floor, i) => {
      const spots = planWallDogs(floor, CONFIG, createRng(i));
      expect(spots.length).toBeLessThanOrEqual(CONFIG.maxPerFloor);
      for (const { wall, floorTile } of spots) {
        total++;
        expect(at(floor, wall)).toBe(TileType.Wall);
        expect(at(floor, floorTile)).toBe(TileType.Floor);
        expect(Math.abs(wall.x - floorTile.x) + Math.abs(wall.y - floorTile.y)).toBe(1);
        const room = floor.rooms.find((r) => roomContainsTile(r, floorTile))!;
        expect(room.kind).toBe(RoomKind.Normal);
        expect(Math.min(room.width, room.height)).toBeGreaterThanOrEqual(CONFIG.minShortSide);
        // ściana po obu stronach (nie przy wejściu)
        const horizontal = wall.y !== floorTile.y;
        const side = horizontal ? [{ x: wall.x - 1, y: wall.y }, { x: wall.x + 1, y: wall.y }] : [{ x: wall.x, y: wall.y - 1 }, { x: wall.x, y: wall.y + 1 }];
        for (const t of side) expect(at(floor, t)).toBe(TileType.Wall);
      }
    });
    expect(total).toBeGreaterThan(10);
  });

  it('deterministycznie: to samo ziarno daje te same psy; kafle z avoid są pomijane', () => {
    const floor = FLOORS[0]!;
    expect(planWallDogs(floor, CONFIG, createRng(5))).toEqual(planWallDogs(floor, CONFIG, createRng(5)));
    const all = planWallDogs(floor, { ...CONFIG, roomChance: 1, maxPerFloor: 99 }, createRng(5));
    const near = all[0]!.floorTile;
    const without = planWallDogs(floor, { ...CONFIG, roomChance: 1, maxPerFloor: 99 }, createRng(5), [near]);
    for (const spot of without) {
      expect(Math.max(Math.abs(spot.floorTile.x - near.x), Math.abs(spot.floorTile.y - near.y))).toBeGreaterThan(2);
    }
  });
});

describe('WallDogState — zapalnik psa w ścianie', () => {
  const wall = { x: 100, y: 100 };

  it('śpi, dopóki gracz jest dalej niż triggerRadius; zbliżenie budzi, po crackMs pies wypada raz', () => {
    const state = new WallDogState(CONFIG);
    expect(state.update(wall, { x: 100 + CONFIG.triggerRadius + 1, y: 100 }, 0)).toBe(false);
    expect(state.phase).toBe(WallDogPhase.Dormant);
    expect(state.crackProgress(0)).toBe(0);
    expect(state.update(wall, { x: 100 + CONFIG.triggerRadius, y: 100 }, 1000)).toBe(false);
    expect(state.phase).toBe(WallDogPhase.Cracking);
    expect(state.burstAt).toBe(1000 + CONFIG.crackMs);
    expect(state.crackProgress(1000 + CONFIG.crackMs / 2)).toBeCloseTo(0.5, 5);
    // ucieczka gracza nie wstrzymuje pękania
    expect(state.update(wall, { x: 900, y: 900 }, 1000 + CONFIG.crackMs - 1)).toBe(false);
    expect(state.update(wall, null, 1000 + CONFIG.crackMs)).toBe(true);
    expect(state.phase).toBe(WallDogPhase.Burst);
    expect(state.update(wall, { x: 100, y: 100 }, 99999)).toBe(false);
    expect(state.crackProgress(99999)).toBe(1);
  });
});

describe('Zadymiona palarnia — popielniczki i śmieci (krok 84)', () => {
  it('popielniczka to purchawka z własnym wyglądem; chmura dymu ma promień jak w arkuszu', () => {
    const puff = BIOMES[BiomeId.SmokeDen].puffballs!;
    expect(puff.look).toBe('ashtray');
    // Krok 143: chmura jak u purchawek Grzybni (promienie klatek arkusza `smoke-cloud.png`).
    expect(puff.cloud.startRadius).toBe(BIOMES[BiomeId.FungalGrove].puffballs!.cloud.startRadius);
    expect(puff.cloud.maxRadius).toBe(BIOMES[BiomeId.FungalGrove].puffballs!.cloud.maxRadius);
  });
});
