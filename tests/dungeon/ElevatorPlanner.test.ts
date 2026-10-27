import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { planElevator } from '@/dungeon/ElevatorPlanner';
import { floorFromAscii, room, sampleFloors } from '../helpers/floors';

describe('winda w północnym murze areny (krok 125)', () => {
  const rows = [
    '#####.#####',
    '#.........#',
    '#.........#',
    '#.........#',
    '###########',
  ];
  const arena = room(0, 1, 1, 9, 3, RoomKind.Boss);

  it('dwa kafle muru nad pierwszym rzędem areny, najbliżej osi', () => {
    const open = floorFromAscii(rows.map((r, y) => (y === 0 ? '###########' : r)), [arena]);
    expect(planElevator(open, arena, 1)).toEqual({ x: 4, y: 0 });
  });

  it('wejście na osi przesuwa windę w bok, z odstępem od wejścia', () => {
    const gated = floorFromAscii(rows, [arena]);
    const spot = planElevator(gated, arena, 1)!;
    expect(spot.y).toBe(0);
    expect(spot.x + 1 < 5 - 1 || spot.x > 5 + 1).toBe(true);
  });

  it('na wygenerowanych piętrach 8: mur nad podłogą areny, z dala od wejść', () => {
    let placed = 0;
    const floors = sampleFloors([8], 30);
    for (const floor of floors) {
      const a = floor.rooms[floor.bossRoomId]!;
      const spot = planElevator(floor, a, 1);
      if (!spot) continue;
      placed++;
      for (const x of [spot.x, spot.x + 1]) {
        expect(floor.tiles[spot.y * floor.width + x]).toBe(TileType.Wall);
        expect(floor.tiles[(spot.y + 1) * floor.width + x]).toBe(TileType.Floor);
      }
      for (const e of findRoomEntrances(floor, a).filter((t) => t.y === spot.y)) {
        expect(e.x < spot.x - 1 || e.x > spot.x + 2).toBe(true);
      }
    }
    expect(placed).toBeGreaterThanOrEqual(floors.length * 0.9);
  });
});
