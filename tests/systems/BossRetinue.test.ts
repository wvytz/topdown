import { describe, expect, it } from 'vitest';
import type { RetinueDefinition } from '@/core/bossTypes';
import { EnemyType } from '@/core/combatTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { BOSS_BY_FLOOR, FLOOR_GUARDIAN } from '@/config/bossConfig';
import { RetinueSchedule, pickRetinueTiles } from '@/systems/BossRetinue';

/** Świta bossa (krok 80): pomocnicy w walce. */
const DEF: RetinueDefinition = {
  type: EnemyType.Rusher,
  firstAfterMs: 1000,
  everyMs: 5000,
  enragedEveryMs: 3000,
  count: 1,
  maxAlive: 2,
  telegraphMs: 800,
  minPlayerDistanceTiles: 3,
};

describe('świta bossa — rytm wezwań', () => {
  it('nieaktywna przed walką; pierwsze wezwanie po firstAfterMs, kolejne co everyMs', () => {
    const s = new RetinueSchedule(DEF);
    expect(s.due(99_999, 0, false)).toBe(0);
    s.activate(0);
    s.activate(500); // powtórna aktywacja nie przesuwa rytmu
    expect(s.due(999, 0, false)).toBe(0);
    expect(s.due(1000, 0, false)).toBe(1);
    expect(s.due(5999, 1, false)).toBe(0);
    expect(s.due(6000, 1, false)).toBe(1);
  });

  it('wściekłość: jeden pomocnik więcej i krótszy odstęp; limit żywych obcina wezwanie', () => {
    const s = new RetinueSchedule(DEF);
    s.activate(0);
    expect(s.due(1000, 0, true)).toBe(2);
    expect(s.due(3999, 0, true)).toBe(0);
    expect(s.due(4000, 1, true)).toBe(1); // limit 2, jeden żyje
    expect(s.due(7000, 2, true)).toBe(0); // pełny limit — wezwanie przepada
    expect(s.due(9999, 0, true)).toBe(0);
    expect(s.due(10_000, 0, true)).toBe(2);
  });
});

describe('świta bossa — miejsca wyjścia', () => {
  const W = 13;
  const ARENA = { id: 0, kind: RoomKind.Boss, x: 1, y: 1, width: 11, height: 11 } as const;
  const tiles = new Array<TileType>(W * W).fill(TileType.Wall);
  for (let y = 1; y <= 11; y++) for (let x = 1; x <= 11; x++) tiles[y * W + x] = TileType.Floor;
  tiles[6 * W + 6] = TileType.StairsLocked;
  const floor = { width: W, tiles };

  it('na podłodze areny, z dala od gracza, muru i od siebie', () => {
    const player = { x: 3, y: 3 };
    for (let seed = 1; seed <= 20; seed++) {
      const picked = pickRetinueTiles(floor, ARENA, player, 3, 3, createRng(seed));
      expect(picked).toHaveLength(3);
      for (const t of picked) {
        expect(tiles[t.y * W + t.x]).toBe(TileType.Floor);
        expect(t.x).toBeGreaterThanOrEqual(2);
        expect(t.x).toBeLessThanOrEqual(10);
        expect(Math.max(Math.abs(t.x - player.x), Math.abs(t.y - player.y))).toBeGreaterThanOrEqual(3);
      }
      for (const a of picked) for (const b of picked) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(2);
    }
  });

  it('deterministyczne dla seeda', () => {
    const a = pickRetinueTiles(floor, ARENA, { x: 6, y: 6 }, 2, 3, createRng(7));
    expect(pickRetinueTiles(floor, ARENA, { x: 6, y: 6 }, 2, 3, createRng(7))).toEqual(a);
  });
});

describe('świta bossa — konfiguracja', () => {
  it('każdy boss ma świtę: rzadka, mała i z telegrafem; pierwsze wezwanie nie od razu', () => {
    for (const boss of [FLOOR_GUARDIAN, ...Object.values(BOSS_BY_FLOOR)]) {
      const r = boss.retinue!;
      expect(r).toBeDefined();
      expect(r.maxAlive).toBeLessThanOrEqual(2);
      expect(r.count).toBe(1);
      expect(r.telegraphMs).toBeGreaterThanOrEqual(800);
      expect(r.firstAfterMs).toBeGreaterThan(boss.openingDelayMs);
      expect(r.enragedEveryMs).toBeLessThan(r.everyMs);
    }
  });
});
