import { describe, expect, it } from 'vitest';
import type { DungeonFloor, Room } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { GATE_WAIT_CONFIG } from '@/config/gateWaitConfig';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { roomContainsTile } from '@/dungeon/rooms';
import { GateWait, gatePosts } from '@/systems/GateWait';
import { sampleFloors } from '../helpers/floors';

const T = 16;

/**
 * Plansza 20×9: pokój 5..11 × 2..6, korytarz w poziomie y=4 od x=0 do pokoju i od pokoju do x=19.
 * Wejścia: (4,4) i (12,4).
 */
function corridorFloor(): { floor: DungeonFloor; room: Room } {
  const width = 20;
  const height = 9;
  const room: Room = { id: 0, x: 5, y: 2, width: 7, height: 5, kind: RoomKind.Normal };
  const tiles = Array.from({ length: width * height }, (_, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    return roomContainsTile(room, { x, y }) || y === 4 ? TileType.Floor : TileType.Wall;
  });
  const floor = { width, height, tiles, rooms: [room] } as unknown as DungeonFloor;
  return { floor, room };
}

const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T });

function setup() {
  const { floor, room } = corridorFloor();
  const gates = findRoomEntrances(floor, room);
  const posts = gatePosts(floor, room, gates, T, GATE_WAIT_CONFIG.postOffsetTiles);
  const wait = new GateWait<string>(GATE_WAIT_CONFIG, floor, T);
  return { floor, room, gates, posts, wait };
}

const input = (self: { x: number; y: number }, target: { x: number; y: number }, now = 0, alert = true) => ({
  self,
  target,
  alert,
  canSeeTarget: true,
  aggroRange: 200,
  now,
});

describe('wrogowie za kratami (krok 132)', () => {
  it('miejsca czekania leżą tuż za kratą, po stronie korytarza', () => {
    const { gates, posts } = setup();
    expect(gates).toEqual([{ x: 4, y: 4 }, { x: 12, y: 4 }]);
    expect(posts).toHaveLength(2);
    const west = posts.find((p) => p.x < 5 * T)!;
    expect(Math.floor(west.x / T)).toBe(3);
    expect(west.y).toBe(at(4, 4).y);
    expect(west.x).toBeCloseTo(at(4, 4).x - GATE_WAIT_CONFIG.postOffsetTiles * T);
  });

  it('pomija kratę, za którą jest mur', () => {
    const { floor, room } = corridorFloor();
    expect(gatePosts(floor, room, [{ x: 8, y: 1 }], T, 0.85)).toEqual([]);
  });

  it('bez krat wróg ściga normalnie', () => {
    const { wait } = setup();
    expect(wait.order('a', input(at(1, 4), at(8, 4)))).toEqual({ holdAt: null, speedMultiplier: 1 });
  });

  it('po opuszczeniu krat wróg spoza pokoju idzie do najbliższej kraty i tam stoi', () => {
    const { wait, room, posts } = setup();
    wait.seal(room, posts);
    const west = posts.find((p) => p.x < 5 * T)!;
    const order = wait.order('a', input(at(1, 4), at(8, 4)));
    expect(order.holdAt).toEqual(west);
    expect(wait.waitingCount).toBe(1);
    // Na miejscu: rozkaz „stój tu, gdzie jesteś”.
    expect(wait.order('a', input(west, at(8, 4))).holdAt).toEqual(west);
    // Z drugiej strony — do wschodniej kraty.
    const east = posts.find((p) => p.x > 12 * T)!;
    expect(wait.order('b', input(at(18, 4), at(8, 4))).holdAt).toEqual(east);
  });

  it('wróg w pokoju i wróg bezczynny poza zasięgiem nie czekają', () => {
    const { wait, room, posts } = setup();
    wait.seal(room, posts);
    expect(wait.order('ghost', input(at(6, 3), at(8, 4))).holdAt).toBeNull();
    const idle = { ...input(at(0, 4), at(10, 4), 0, false), aggroRange: 50 };
    expect(wait.order('idle', idle).holdAt).toBeNull();
    expect(wait.order('idle', { ...idle, aggroRange: 500 }).holdAt).not.toBeNull();
  });

  it('cel spoza pokoju — wróg wraca do pościgu (bez zrywu)', () => {
    const { wait, room, posts } = setup();
    wait.seal(room, posts);
    wait.order('a', input(at(1, 4), at(8, 4)));
    expect(wait.order('a', input(at(1, 4), at(2, 4)))).toEqual({ holdAt: null, speedMultiplier: 1 });
    expect(wait.waitingCount).toBe(0);
  });

  it('po podniesieniu krat czekający ruszają na chwilę szybciej', () => {
    const { wait, room, posts } = setup();
    wait.seal(room, posts);
    wait.order('a', input(at(1, 4), at(8, 4)));
    wait.release(room, 1000);
    const { durationMs, speedMultiplier } = GATE_WAIT_CONFIG.surge;
    expect(speedMultiplier).toBeGreaterThan(1);
    expect(durationMs).toBeLessThan(1000);
    expect(wait.order('a', input(at(3, 4), at(8, 4), 1000))).toEqual({ holdAt: null, speedMultiplier });
    expect(wait.order('a', input(at(4, 4), at(8, 4), 1000 + durationMs - 1)).speedMultiplier).toBe(speedMultiplier);
    expect(wait.order('a', input(at(5, 4), at(8, 4), 1000 + durationMs)).speedMultiplier).toBe(1);
    // Kto nie czekał — bez zrywu.
    expect(wait.order('b', input(at(18, 4), at(8, 4), 1000)).speedMultiplier).toBe(1);
  });

  it('zabity wróg znika z rejestru', () => {
    const { wait, room, posts } = setup();
    wait.seal(room, posts);
    wait.order('a', input(at(1, 4), at(8, 4)));
    wait.forget('a');
    expect(wait.waitingCount).toBe(0);
  });

  it('na prawdziwych piętrach każda arena ma miejsce czekania za kratą i poza areną', () => {
    for (const floor of sampleFloors([1, 2, 3, 4], 5)) {
      const arena = floor.rooms[floor.bossRoomId]!;
      const posts = gatePosts(floor, arena, findRoomEntrances(floor, arena), T, GATE_WAIT_CONFIG.postOffsetTiles);
      expect(posts.length).toBeGreaterThan(0);
      for (const p of posts) expect(roomContainsTile(arena, { x: Math.floor(p.x / T), y: Math.floor(p.y / T) })).toBe(false);
    }
  });
});
