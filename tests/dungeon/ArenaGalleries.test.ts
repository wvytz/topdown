import { describe, expect, it } from 'vitest';
import { TileType } from '@/core/dungeonTypes';
import { carveArenaGalleries } from '@/dungeon/ArenaGalleries';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { roomContainsTile } from '@/dungeon/rooms';
import { sampleFloors } from '../helpers/floors';

describe('galerie areny (krok 44)', () => {
  const floors = sampleFloors([5], 40);

  it('wnęki tylko w litej skale; wejście do wnęki to nowe wejście areny (dostanie kratę)', () => {
    let total = 0;
    for (const floor of floors) {
      const arena = floor.rooms[floor.bossRoomId]!;
      const before = findRoomEntrances(floor, arena).length;
      const { floor: carved, posts } = carveArenaGalleries(floor, 3, 2);
      total += posts.length;
      expect(posts.length).toBeLessThanOrEqual(3);
      expect(findRoomEntrances(carved, arena)).toHaveLength(before + posts.length);
      const changed = carved.tiles.flatMap((t, i) => (t !== floor.tiles[i] ? [i] : []));
      expect(changed).toHaveLength(posts.length * 3);
      for (const i of changed) {
        expect(floor.tiles[i]).toBe(TileType.Wall);
        expect(carved.tiles[i]).toBe(TileType.Floor);
      }
      for (const post of posts) {
        expect(carved.tiles[post.y * carved.width + post.x]).toBe(TileType.Floor);
        expect(floor.rooms.some((r) => roomContainsTile(r, post))).toBe(false);
      }
      // Pozostałe kafle piętra bez zmian (pokoje, korytarze, schody).
      expect(carved.stairs).toEqual(floor.stairs);
    }
    // Na większości pięter mieszczą się wszystkie trzy galerie.
    expect(total / floors.length).toBeGreaterThan(2.5);
  });

  it('bez galerii — to samo piętro; deterministycznie', () => {
    const floor = floors[0]!;
    expect(carveArenaGalleries(floor, 0, 2).floor).toBe(floor);
    expect(carveArenaGalleries(floor, 3, 2)).toEqual(carveArenaGalleries(floor, 3, 2));
  });

  it('każda galeria po innej stronie areny', () => {
    for (const floor of floors) {
      const arena = floor.rooms[floor.bossRoomId]!;
      const sides = carveArenaGalleries(floor, 3, 2).posts.map((p) =>
        p.y < arena.y ? 'N' : p.y >= arena.y + arena.height ? 'S' : p.x < arena.x ? 'W' : 'E',
      );
      expect(new Set(sides).size).toBe(sides.length);
    }
  });
});
