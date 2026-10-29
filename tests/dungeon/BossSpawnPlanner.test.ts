import { describe, expect, it } from 'vitest';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import { BOSS_SPAWN_SAFETY } from '@/config/bossConfig';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { planBossSpawn, spawnKeepOuts } from '@/dungeon/BossSpawnPlanner';

/** Miejsce startu bossa (krok 131, uwaga testera: bossowie pojawiali się bohaterowi na twarzy). */
const W = 15;
const ARENA = { id: 0, kind: RoomKind.Boss, x: 2, y: 2, width: 11, height: 11 } as const;
const tiles = new Array<TileType>(W * W).fill(TileType.Wall);
for (let y = 2; y <= 12; y++) for (let x = 2; x <= 12; x++) tiles[y * W + x] = TileType.Floor;
// Schody na środku areny (boss na nich stoi) i wejście z lewej, na wysokości środka.
tiles[7 * W + 7] = TileType.StairsLocked;
tiles[7 * W + 1] = TileType.Floor;
const floor = { width: W, height: W, tiles };
const CENTER = { x: 7.5, y: 7.5 };
const BODY = 1;

const dist = (a: Vector2, b: Vector2): number => Math.hypot(a.x - b.x, a.y - b.y);
const keepOuts = (heroes: Vector2[]) => spawnKeepOuts(findRoomEntrances(floor, ARENA), heroes, BOSS_SPAWN_SAFETY);

describe('miejsce startu bossa', () => {
  it('środek areny zostaje, gdy bohater jest daleko (wspinaczka)', () => {
    expect(planBossSpawn(floor, ARENA, CENTER, keepOuts([{ x: 40, y: 40 }]), BODY)).toEqual(CENTER);
  });

  it('areny bossów: bohater przy lewym murze — boss odsuwa się na bezpieczny dystans', () => {
    const hero = { x: ARENA.x + 2.5, y: CENTER.y };
    const at = planBossSpawn(floor, ARENA, CENTER, keepOuts([hero]), BODY);
    expect(dist(at, hero)).toBeGreaterThanOrEqual(BOSS_SPAWN_SAFETY.minPlayerDistanceTiles);
    expect(dist(at, CENTER)).toBeLessThan(3);
  });

  it('duet: gospodarz z lewej boku środka nie staje przy wejściu ani na bohaterze, partner trzyma odstęp', () => {
    const heroes = [
      { x: ARENA.x + 2.5, y: CENTER.y },
      { x: ARENA.x + 2.5, y: CENTER.y + 1 },
    ];
    const host = planBossSpawn(floor, ARENA, { x: CENTER.x - 2.5, y: CENTER.y }, keepOuts(heroes), BODY);
    const partnerKeepOut = [...keepOuts(heroes), { at: host, minTiles: BOSS_SPAWN_SAFETY.minBossGapTiles }];
    const partner = planBossSpawn(floor, ARENA, { x: CENTER.x + 2.5, y: CENTER.y }, partnerKeepOut, BODY);
    for (const boss of [host, partner]) {
      for (const hero of heroes) expect(dist(boss, hero)).toBeGreaterThanOrEqual(BOSS_SPAWN_SAFETY.minPlayerDistanceTiles);
      expect(dist(boss, { x: 1.5, y: 7.5 })).toBeGreaterThanOrEqual(BOSS_SPAWN_SAFETY.minEntranceDistanceTiles);
    }
    expect(dist(host, partner)).toBeGreaterThanOrEqual(BOSS_SPAWN_SAFETY.minBossGapTiles);
  });

  it('ciało mieści się na arenie, nigdy na murze', () => {
    const hero = { x: CENTER.x, y: CENTER.y };
    const at = planBossSpawn(floor, ARENA, CENTER, keepOuts([hero]), 1.5);
    expect(at.x - ARENA.x).toBeGreaterThanOrEqual(1.5);
    expect(ARENA.x + ARENA.width - at.x).toBeGreaterThanOrEqual(1.5);
    expect(at.y - ARENA.y).toBeGreaterThanOrEqual(1.5);
    expect(ARENA.y + ARENA.height - at.y).toBeGreaterThanOrEqual(1.5);
    expect(tiles[Math.floor(at.y) * W + Math.floor(at.x)]).not.toBe(TileType.Wall);
  });

  it('bez miejsca z pełnym odstępem: tam, gdzie brakuje go najmniej', () => {
    const at = planBossSpawn(floor, ARENA, CENTER, [{ at: CENTER, minTiles: 50 }], BODY);
    // Najdalej od środka — w narożniku areny (ciało 1 kafel od muru).
    expect(dist(at, CENTER)).toBeCloseTo(4 * Math.SQRT2, 5);
  });

  it('deterministyczne', () => {
    const hero = [{ x: ARENA.x + 2.5, y: CENTER.y }];
    expect(planBossSpawn(floor, ARENA, CENTER, keepOuts(hero), BODY)).toEqual(planBossSpawn(floor, ARENA, CENTER, keepOuts(hero), BODY));
  });
});
