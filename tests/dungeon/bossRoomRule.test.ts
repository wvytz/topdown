import { describe, expect, it } from 'vitest';
import { RoomKind } from '@/core/dungeonTypes';
import { getDungeonConfigForFloor } from '@/config/gameConfig';
import { DungeonGenerator } from '@/dungeon/DungeonGenerator';
import { checkBossRoomAtEnd } from '@/dungeon/bossRoomRule';
import { floorFromAscii } from '../helpers/floors';
import { TOWER_CONFIG } from '@/config/towerConfig';

const L = TOWER_CONFIG.floorsPerLoop;

const generate = (floor: number, seed: number) => new DungeonGenerator(getDungeonConfigForFloor(floor)).generate(seed);

describe('arena na końcu piętra (krok 45)', () => {
  it('od piętra 2: przez arenę nie da się przejść dalej; najwyżej jeden ślepy pokój za nią', () => {
    let withEnd = 0;
    let total = 0;
    for (const floorNumber of [2, 3, 4, 5, 6, 7, L + 5]) {
      for (let seed = 0; seed < 40; seed++) {
        const floor = generate(floorNumber, seed * 7919 + floorNumber);
        const check = checkBossRoomAtEnd(floor);
        expect(check.ok, `piętro ${floorNumber}, seed ${seed}: ${check.reason}`).toBe(true);
        expect(check.endRoomId ?? undefined).toBe(floor.endRoomId);
        if (floor.endRoomId !== undefined) {
          withEnd++;
          expect(floor.rooms[floor.endRoomId]!.kind).toBe(RoomKind.Secret);
          expect(floor.endRoomId).not.toBe(floor.startRoomId);
        }
        total++;
      }
    }
    // Pokój końcowy (ukryta komnata) tylko na piętrach Grzybni; z badanych pięter (2–7 i 5. w drugim kręgu) to samo piętro 3, czyli 1 z 7.
    expect(withEnd).toBeGreaterThan(total * 0.1);
    expect(withEnd).toBeLessThan(total * 0.2);
  });

  it('ukryta komnata (pokój końcowy) tylko w Grzybni, także w kolejnych kręgach (krok 51)', () => {
    for (const floorNumber of [1, 2, 4, 5, 6, 7, 8, 9, L + 1, L + 2, L + 4, L + 5, 2 * L]) {
      expect(getDungeonConfigForFloor(floorNumber).endRoomChance, `piętro ${floorNumber}`).toBe(0);
    }
    for (const floorNumber of [3, L + 3, 2 * L + 3]) expect(getDungeonConfigForFloor(floorNumber).endRoomChance, `piętro ${floorNumber}`).toBe(1);
    for (let seed = 0; seed < 20; seed++) {
      expect(generate(3, seed * 31 + 1).endRoomId, `seed ${seed}`).toBeDefined();
      expect(generate(4, seed * 31 + 1).endRoomId, `seed ${seed}`).toBeUndefined();
    }
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
