import { describe, expect, it } from 'vitest';
import { RoomKind } from '@/core/dungeonTypes';
import type { Room } from '@/core/dungeonTypes';
import { RoomMarkerKind, roomMarkers } from '@/systems/RoomMarkers';

const room = (id: number, x: number): Room => ({ id, x, y: 0, width: 7, height: 7, kind: RoomKind.Normal });
const rooms = [room(0, 0), room(1, 10), room(2, 20)];

describe('roomMarkers (krok 163)', () => {
  it('bez kapliczki, zasadzki i elit — nic', () => {
    expect(roomMarkers({ rooms, shrine: null, ambushRoomId: null, elites: [] })).toEqual([]);
  });

  it('kapliczka na swoim kaflu, zasadzka na środku pokoju', () => {
    const markers = roomMarkers({ rooms, shrine: { x: 2, y: 2 }, ambushRoomId: 1, elites: [] });
    expect(markers).toEqual([
      { kind: RoomMarkerKind.Shrine, x: 2, y: 2 },
      { kind: RoomMarkerKind.Ambush, x: 13, y: 3 },
    ]);
  });

  it('jedna ikonka elity na pokój; elity poza pokojem (korytarz) i w zasadzce — bez ikonki', () => {
    const markers = roomMarkers({
      rooms,
      shrine: null,
      ambushRoomId: 1,
      elites: [{ x: 21, y: 1 }, { x: 25, y: 5 }, { x: 11, y: 1 }, { x: 8, y: 3 }],
    });
    expect(markers.filter((m) => m.kind === RoomMarkerKind.Elite)).toEqual([{ kind: RoomMarkerKind.Elite, x: 23, y: 3 }]);
  });

  it('elita w pokoju kapliczki nie zasłania jej ikonki', () => {
    const markers = roomMarkers({ rooms, shrine: { x: 3, y: 3 }, ambushRoomId: null, elites: [{ x: 1, y: 1 }] });
    const elite = markers.find((m) => m.kind === RoomMarkerKind.Elite)!;
    expect(Math.abs(elite.x - 3)).toBeGreaterThanOrEqual(3);
  });
});
