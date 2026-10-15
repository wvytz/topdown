import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { FUNGAL_DEVOURER } from '@/config/bossConfig';
import { THRONE_ROOM } from '@/config/dressingConfig';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { planLarders } from '@/dungeon/LarderPlanner';
import { ThroneDecalKind, chebyshev, planThrone, planThroneDecals } from '@/dungeon/ThronePlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { floorFromAscii, room, sampleFloors } from '../helpers/floors';

const floors = sampleFloors([4], 30);
const isFloor = (floor: (typeof floors)[number], x: number, y: number) => floor.tiles[y * floor.width + x] === TileType.Floor;

describe('sala tronowa Pożeracza (krok 39): tron', () => {
  it('tron 3×3 na podłodze, oparciem do północnej ściany, z dala od wejść z północy', () => {
    let placed = 0;
    for (const floor of floors) {
      const arena = floor.rooms[floor.bossRoomId]!;
      const throne = planThrone(floor, arena, THRONE_ROOM.entranceClearTiles);
      if (!throne) continue;
      placed++;
      expect(throne.y).toBe(arena.y + 1);
      for (let y = throne.y - 1; y <= throne.y + 1; y++) {
        for (let x = throne.x - 1; x <= throne.x + 1; x++) {
          expect(roomContainsTile(arena, { x, y })).toBe(true);
          expect(isFloor(floor, x, y)).toBe(true);
        }
      }
      const north = findRoomEntrances(floor, arena).filter((t) => t.y === arena.y - 1);
      for (const e of north) expect(Math.abs(e.x - throne.x)).toBeGreaterThan(THRONE_ROOM.entranceClearTiles);
    }
    // Areny mają zwykle wolną północną ścianę — tron stoi prawie zawsze.
    expect(placed).toBeGreaterThanOrEqual(floors.length * 0.8);
  });

  it('tron najbliżej osi areny; wejście na osi przesuwa go w bok', () => {
    const rows = [
      '#####.#####',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '###########',
    ];
    const arena = room(0, 1, 1, 9, 4, RoomKind.Boss);
    const open = floorFromAscii(rows.map((r, y) => (y === 0 ? '###########' : r)), [arena]);
    expect(planThrone(open, arena, 2)).toEqual({ x: 5, y: 2 });
    const gated = floorFromAscii(rows, [arena]);
    const throne = planThrone(gated, arena, 2)!;
    expect(Math.abs(throne.x - 5)).toBeGreaterThan(2);
  });

  it('brak miejsca = sala bez tronu', () => {
    const arena = room(0, 1, 1, 3, 2, RoomKind.Boss);
    const floor = floorFromAscii(['#####', '#...#', '#...#', '#####'], [arena]);
    expect(planThrone(floor, arena, 2)).toBeNull();
  });

  it('kokony spiżarni nie stoją przy tronie', () => {
    floors.forEach((floor, i) => {
      const arena = floor.rooms[floor.bossRoomId]!;
      const throne = planThrone(floor, arena, THRONE_ROOM.entranceClearTiles);
      const larders = planLarders(floor, arena, FUNGAL_DEVOURER.feast.larders, createRng(i), throne, THRONE_ROOM.throneClearTiles);
      expect(larders.length).toBeGreaterThanOrEqual(3);
      if (throne) for (const t of larders) expect(chebyshev(t, throne)).toBeGreaterThan(THRONE_ROOM.throneClearTiles);
    });
  });
});

describe('sala tronowa Pożeracza (krok 39): naklejki podłogi', () => {
  const config = THRONE_ROOM.decals;

  it('na podłodze areny, z odstępem, poza środkiem i tronem; liczba w zakresie', () => {
    floors.forEach((floor, i) => {
      const arena = floor.rooms[floor.bossRoomId]!;
      const throne = planThrone(floor, arena, THRONE_ROOM.entranceClearTiles);
      const decals = planThroneDecals(floor, arena, throne, config, createRng(i));
      expect(decals.length).toBeLessThanOrEqual(config.count.max);
      expect(decals.length).toBeGreaterThanOrEqual(config.count.min);
      const center = { x: arena.x + Math.floor(arena.width / 2), y: arena.y + Math.floor(arena.height / 2) };
      for (const d of decals) {
        expect(roomContainsTile(arena, d.tile)).toBe(true);
        expect(isFloor(floor, d.tile.x, d.tile.y)).toBe(true);
        expect(chebyshev(d.tile, center)).toBeGreaterThan(config.centerClearTiles);
        if (throne) expect(chebyshev(d.tile, throne)).toBeGreaterThan(1);
        for (const o of decals) if (o !== d) expect(chebyshev(d.tile, o.tile)).toBeGreaterThanOrEqual(config.minSpacingTiles);
      }
    });
  });

  it('rodzaje z wag; ten sam seed = te same naklejki', () => {
    const floor = floors[0]!;
    const arena = floor.rooms[floor.bossRoomId]!;
    const kinds = new Set<ThroneDecalKind>();
    for (let i = 0; i < 40; i++) for (const d of planThroneDecals(floor, arena, null, config, createRng(i))) kinds.add(d.kind);
    expect(kinds.size).toBe(config.weights.length);
    expect(planThroneDecals(floor, arena, null, config, createRng(3))).toEqual(planThroneDecals(floor, arena, null, config, createRng(3)));
  });

  it('wagi odpowiadają kolumnom arkusza naklejek', () => {
    const sheet = SPRITE_SHEETS.throneDecals;
    expect(config.weights.length).toBe(sheet.sheetWidth / sheet.frameWidth);
  });
});
