import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { BASE_DUNGEON_CONFIG, STAIRS_SIZE, getDungeonConfigForFloor } from '@/config/gameConfig';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { roomContainsTile } from '@/dungeon/rooms';
import { STAIRS_WALL_INSET, stairsTiles } from '@/dungeon/stairs';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { countReachable, countWalkable, sampleFloors } from '../helpers/floors';

// Testy właściwości: sprawdzamy niezmienniki na wielu wygenerowanych piętrach.
const FLOORS = sampleFloors([1, 2, 3, 5, 8, 10], 40);

describe('DungeonGenerator — niezmienniki pięter', () => {
  it('każde pole podłogi jest osiągalne ze startu (piętro spójne)', () => {
    for (const floor of FLOORS) {
      expect(countReachable(floor, floor.playerSpawn)).toBe(countWalkable(floor));
    }
  });

  it('start i komnata bossa to różne pokoje o właściwych rodzajach', () => {
    for (const floor of FLOORS) {
      expect(floor.startRoomId).not.toBe(floor.bossRoomId);
      expect(floor.rooms[floor.startRoomId]?.kind).toBe(RoomKind.Start);
      expect(floor.rooms[floor.bossRoomId]?.kind).toBe(RoomKind.Boss);
      expect(floor.rooms.filter((r) => r.kind === RoomKind.Boss)).toHaveLength(1);
    }
  });

  it('arena bossa ma rozmiar z konfiguracji (miejsce na ataki obszarowe)', () => {
    const { min, max } = BASE_DUNGEON_CONFIG.bossRoomSize;
    for (const floor of FLOORS) {
      const arena = floor.rooms[floor.bossRoomId]!;
      expect(arena.width).toBeGreaterThanOrEqual(min);
      expect(arena.height).toBeGreaterThanOrEqual(min);
      expect(arena.width).toBeLessThanOrEqual(max);
      expect(arena.height).toBeLessThanOrEqual(max);
    }
  });

  it('zamknięte schody 2×2 stoją w komnacie bossa, gracz startuje w pokoju startowym', () => {
    for (const floor of FLOORS) {
      const stairs = stairsTiles(floor);
      expect(stairs).toHaveLength(STAIRS_SIZE * STAIRS_SIZE);
      for (const tile of stairs) {
        expect(floor.tiles[tile.y * floor.width + tile.x]).toBe(TileType.StairsLocked);
        expect(roomContainsTile(floor.rooms[floor.bossRoomId]!, tile)).toBe(true);
      }
      expect(floor.tiles.filter((t) => t === TileType.StairsLocked)).toHaveLength(STAIRS_SIZE * STAIRS_SIZE);
      expect(roomContainsTile(floor.rooms[floor.startRoomId]!, floor.playerSpawn)).toBe(true);
    }
  });

  it('schody stoją w narożniku areny (krok 75): odsunięte od ścian o STAIRS_WALL_INSET, poza wejściami, bez schodów pod bossem', () => {
    for (const floor of FLOORS) {
      const arena = floor.rooms[floor.bossRoomId]!;
      const { stairs } = floor;
      const left = stairs.x - arena.x;
      const right = arena.x + arena.width - (stairs.x + STAIRS_SIZE);
      const top = stairs.y - arena.y;
      const bottom = arena.y + arena.height - (stairs.y + STAIRS_SIZE);
      expect(Math.min(left, right)).toBe(STAIRS_WALL_INSET);
      expect(Math.min(top, bottom)).toBe(STAIRS_WALL_INSET);
      // Wejścia do areny nie są zasłonięte schodami: od każdego jest co najmniej kafel odstępu.
      for (const e of findRoomEntrances(floor, arena)) {
        const dx = Math.max(stairs.x - e.x, 0, e.x - (stairs.x + STAIRS_SIZE - 1));
        const dy = Math.max(stairs.y - e.y, 0, e.y - (stairs.y + STAIRS_SIZE - 1));
        expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('krawędź mapy to zawsze ściana', () => {
    for (const floor of FLOORS) {
      for (let x = 0; x < floor.width; x++) {
        expect(floor.tiles[x]).toBe(TileType.Wall);
        expect(floor.tiles[(floor.height - 1) * floor.width + x]).toBe(TileType.Wall);
      }
      for (let y = 0; y < floor.height; y++) {
        expect(floor.tiles[y * floor.width]).toBe(TileType.Wall);
        expect(floor.tiles[y * floor.width + floor.width - 1]).toBe(TileType.Wall);
      }
    }
  });

  it('liczba pokojów mieści się w konfiguracji piętra', () => {
    for (const floorNumber of [1, 4, 9]) {
      const config = getDungeonConfigForFloor(floorNumber);
      const floor = new DungeonGenerator(config).generate(floorNumber * 31);
      expect(floor.rooms.length).toBeGreaterThanOrEqual(2);
      expect(floor.rooms.length).toBeLessThanOrEqual(config.roomCount.max);
    }
  });
});

describe('DungeonGenerator — determinizm i skalowanie', () => {
  it('ten sam seed daje identyczne piętro', () => {
    const generator = new DungeonGenerator(BASE_DUNGEON_CONFIG);
    expect(generator.generate(2024)).toEqual(generator.generate(2024));
  });

  it('różne seedy dają różne piętra', () => {
    const generator = new DungeonGenerator(BASE_DUNGEON_CONFIG);
    expect(generator.generate(1).tiles).not.toEqual(generator.generate(2).tiles);
  });

  it('mapa rośnie z piętrem i przestaje rosnąć po limicie', () => {
    expect(getDungeonConfigForFloor(3).widthTiles).toBeGreaterThan(getDungeonConfigForFloor(1).widthTiles);
    expect(getDungeonConfigForFloor(20)).toEqual(getDungeonConfigForFloor(7));
  });

  it('zgłasza błąd, gdy na mapie nie mieszczą się dwa pokoje', () => {
    const tiny = { ...BASE_DUNGEON_CONFIG, widthTiles: 14, heightTiles: 14 };
    expect(() => new DungeonGenerator(tiny).generate(1)).toThrow();
  });
});
