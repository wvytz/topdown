import { describe, expect, it } from 'vitest';
import { RoomKind } from '@/core/dungeonTypes';
import { getDungeonConfigForFloor } from '@/config/gameConfig';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { checkBossRoomAtEnd } from '@/dungeon/bossRoomRule';
import { floorFromAscii } from '../helpers/floors';

const generate = (floor: number, seed: number) => new DungeonGenerator(getDungeonConfigForFloor(floor)).generate(seed);

describe('arena na końcu piętra (krok 45)', () => {
  it('od piętra 2: przez arenę nie da się przejść dalej; najwyżej jeden ślepy pokój za nią', () => {
    let withEnd = 0;
    let total = 0;
    for (const floorNumber of [2, 3, 4, 5, 6, 7, 12]) {
      for (let seed = 0; seed < 40; seed++) {
        const floor = generate(floorNumber, seed * 7919 + floorNumber);
        const check = checkBossRoomAtEnd(floor);
        expect(check.ok, `piętro ${floorNumber}, seed ${seed}: ${check.reason}`).toBe(true);
        expect(check.endRoomId ?? undefined).toBe(floor.endRoomId);
        if (floor.endRoomId !== undefined) {
          withEnd++;
          expect(floor.rooms[floor.endRoomId]!.kind).toBe(RoomKind.Normal);
          expect(floor.endRoomId).not.toBe(floor.startRoomId);
        }
        total++;
      }
    }
    // Pokój końcowy bywa, ale nie zawsze (szansa z konfiguracji).
    expect(withEnd).toBeGreaterThan(total * 0.25);
    expect(withEnd).toBeLessThan(total * 0.75);
  });

  it('piętro 1 jest wyjątkiem (reguła wyłączona)', () => {
    expect(getDungeonConfigForFloor(1).bossRoomAtEnd).toBe(false);
    expect(getDungeonConfigForFloor(2).bossRoomAtEnd).toBe(true);
  });

  it('walidator: pętla przez arenę jest błędem, ślepy pokój za nią — pokojem końcowym', () => {
    // Arena (środek) z wejściami z lewej i prawej; pokoje po bokach łączy też dolny korytarz.
    const rows = [
      '###############',
      '#..#.....##..##',
      '#.............#',
      '#..#.....##...#',
      '#.###########.#',
      '#.............#',
      '###############',
    ];
    const rooms = [
      { id: 0, x: 4, y: 1, width: 5, height: 3, kind: RoomKind.Boss },
      { id: 1, x: 1, y: 1, width: 2, height: 3, kind: RoomKind.Start },
      { id: 2, x: 11, y: 1, width: 2, height: 3, kind: RoomKind.Normal },
    ];
    const make = (r: readonly string[]) => ({ ...floorFromAscii(r, rooms), startRoomId: 1, bossRoomId: 0 });
    expect(checkBossRoomAtEnd(make(rows)).ok).toBe(false);
    // Przecięty dolny korytarz: pokój 2 osiągalny tylko przez arenę — to pokój końcowy.
    const cut = rows.map((r, y) => (y === 5 ? `${r.slice(0, 6)}#${r.slice(7)}` : r));
    expect(checkBossRoomAtEnd(make(cut))).toEqual({ ok: true, endRoomId: 2 });
  });
});
