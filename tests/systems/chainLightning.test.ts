import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { chainTargets, roomAtPoint, sparkLinkRule } from '@/systems/ChainLightning';

/**
 * Krok 151 (przegląd buildu): piorun Iskrownika i Elektrycznej strzały nie przechodzi przez ściany
 * i nie wychodzi z pokoju bohatera. Plansza: dwa pokoje 5×5 przedzielone murem, z przejściem w rzędzie 3.
 *
 *   x: 0 1 2 3 4 5 6 7 8 9 10 11 12
 *      # . . . . . # . . . . .  #     (pokój A: x 1–5, pokój B: x 7–11)
 */
const T = 10;
const W = 13;
const H = 7;
const tiles = new Array<TileType>(W * H).fill(TileType.Wall);
for (let y = 1; y <= 5; y++) {
  for (let x = 1; x <= 5; x++) tiles[y * W + x] = TileType.Floor;
  for (let x = 7; x <= 11; x++) tiles[y * W + x] = TileType.Floor;
}
tiles[3 * W + 6] = TileType.Floor; // przejście między pokojami
const ROOM_A = { id: 0, kind: RoomKind.Normal, x: 1, y: 1, width: 5, height: 5 };
const ROOM_B = { id: 1, kind: RoomKind.Normal, x: 7, y: 1, width: 5, height: 5 };
const floor = { width: W, height: H, tiles, rooms: [ROOM_A, ROOM_B] };
const px = (tx: number, ty: number) => ({ x: tx * T + T / 2, y: ty * T + T / 2 });

describe('zasięg pioruna (krok 151)', () => {
  it('pokój pod punktem; korytarz to null', () => {
    expect(roomAtPoint(floor.rooms, px(2, 2), T)).toBe(ROOM_A);
    expect(roomAtPoint(floor.rooms, px(6, 3), T)).toBeNull();
  });

  it('bohater w pokoju: wróg za ścianą w sąsiednim pokoju jest poza zasięgiem, nawet blisko', () => {
    const hero = px(5, 1);
    const behindWall = { ...px(7, 1), radius: 4 };
    const inRoom = { ...px(2, 5), radius: 4 };
    const rule = sparkLinkRule(floor, hero, T);
    expect(chainTargets(hero, [behindWall, inRoom], 1, 200, undefined, rule)).toEqual([inRoom]);
  });

  it('bohater w pokoju: wróg w przejściu albo za kratą (poza pokojem) też nie, mimo linii wzroku', () => {
    const hero = px(4, 3);
    const rule = sparkLinkRule(floor, hero, T);
    expect(rule(hero, px(6, 3))).toBe(false);
    expect(rule(hero, px(8, 3))).toBe(false);
    expect(rule(hero, px(2, 4))).toBe(true);
  });

  it('bohater w korytarzu: wystarcza linia wzroku', () => {
    const hero = px(6, 3);
    const rule = sparkLinkRule(floor, hero, T);
    expect(rule(hero, px(9, 3))).toBe(true);
    expect(rule(hero, px(3, 3))).toBe(true);
    expect(rule(px(5, 1), px(7, 1))).toBe(false);
  });

  it('łańcuch nie przeskakuje przez ścianę między celami', () => {
    const hero = px(6, 3);
    const first = { ...px(5, 1), radius: 4 };
    const acrossWall = { ...px(7, 1), radius: 4 };
    const rule = sparkLinkRule(floor, hero, T);
    expect(chainTargets(first, [acrossWall], 2, 200, (t) => t === first, rule)).toEqual([]);
  });
});
