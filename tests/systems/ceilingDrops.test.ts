import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/random';
import type { CeilingDropConfig, CeilingDropInput } from '@/systems/CeilingDrops';
import { CeilingDropPlanner, dropShadowRadius } from '@/systems/CeilingDrops';
import { BIOMES, BiomeId } from '@/config/biomeConfig';

const CONFIG: CeilingDropConfig = {
  firstDelayMs: 2000,
  intervalMs: { min: 5000, max: 5000 },
  maxPerRoom: 2,
  maxAlive: 3,
  offset: { min: 0, max: 40 },
  telegraphMs: 1100,
  fallMs: 220,
  radius: 16,
  damage: 12,
  knockback: 200,
  placementTries: 6,
};
const PLAYER = { x: 500, y: 500 };
const FRAME = 16;

function input(now: number, over: Partial<CeilingDropInput> = {}): CeilingDropInput {
  return { now, player: PLAYER, roomId: 1, aliveDropped: 0, canLandAt: () => true, ...over };
}

/** Symulacja klatka po klatce: zwraca chwile zrzutów. */
function run(planner: CeilingDropPlanner, from: number, to: number, over: Partial<CeilingDropInput> = {}): number[] {
  const at: number[] = [];
  for (let now = from; now < to; now += FRAME) if (planner.update(input(now, over))) at.push(now);
  return at;
}

describe('CeilingDropPlanner — pająki z sufitu', () => {
  it('pierwszy zrzut po firstDelayMs od wejścia do pokoju, kolejny po intervalMs, najwyżej maxPerRoom', () => {
    const planner = new CeilingDropPlanner(CONFIG, createRng(1));
    const drops = run(planner, 0, 30_000);
    expect(drops).toHaveLength(CONFIG.maxPerRoom);
    expect(drops[0]).toBeGreaterThanOrEqual(CONFIG.firstDelayMs);
    expect(drops[0]).toBeLessThan(CONFIG.firstDelayMs + FRAME);
    expect(drops[1]! - drops[0]!).toBeGreaterThanOrEqual(5000);
    expect(drops[1]! - drops[0]!).toBeLessThan(5000 + FRAME);
  });

  it('w korytarzu (bez pokoju) nic nie spada', () => {
    const planner = new CeilingDropPlanner(CONFIG, createRng(1));
    expect(run(planner, 0, 30_000, { roomId: null })).toHaveLength(0);
  });

  it('każdy pokój ma własny limit; powrót do pokoju nie odnawia limitu', () => {
    const planner = new CeilingDropPlanner(CONFIG, createRng(1));
    expect(run(planner, 0, 30_000, { roomId: 1 })).toHaveLength(2);
    expect(run(planner, 30_000, 60_000, { roomId: 2 })).toHaveLength(2);
    expect(run(planner, 60_000, 90_000, { roomId: 1 })).toHaveLength(0);
  });

  it('pełny limit żywych wstrzymuje zrzuty (bez zużywania limitu pokoju)', () => {
    const planner = new CeilingDropPlanner(CONFIG, createRng(1));
    expect(run(planner, 0, 20_000, { aliveDropped: CONFIG.maxAlive })).toHaveLength(0);
    expect(run(planner, 20_000, 40_000, { aliveDropped: 0 })).toHaveLength(2);
  });

  it('ląduje blisko gracza, tylko tam, gdzie wolno; bez miejsca zrzut przepada', () => {
    const planner = new CeilingDropPlanner(CONFIG, createRng(7));
    let drop = null;
    for (let now = 0; !drop && now < 10_000; now += FRAME) drop = planner.update(input(now));
    expect(drop).not.toBeNull();
    const d = Math.hypot(drop!.position.x - PLAYER.x, drop!.position.y - PLAYER.y);
    expect(d).toBeLessThanOrEqual(CONFIG.offset.max + 1e-9);
    expect(drop!.landAt - drop!.telegraphStartAt).toBe(CONFIG.telegraphMs);

    const blocked = new CeilingDropPlanner(CONFIG, createRng(7));
    expect(run(blocked, 0, 30_000, { canLandAt: () => false })).toHaveLength(0);
  });

  it('deterministyczny dla tego samego ziarna', () => {
    const a = new CeilingDropPlanner(CONFIG, createRng(42));
    const b = new CeilingDropPlanner(CONFIG, createRng(42));
    const collect = (p: CeilingDropPlanner) => {
      const out: unknown[] = [];
      for (let now = 0; now < 20_000; now += FRAME) {
        const drop = p.update(input(now));
        if (drop) out.push(drop);
      }
      return out;
    };
    expect(collect(a)).toEqual(collect(b));
  });

  it('cień rośnie od 0 do pełnego promienia w czasie telegrafu', () => {
    const drop = { position: PLAYER, telegraphStartAt: 1000, landAt: 2100, radius: 16, damage: 12, knockback: 200 };
    expect(dropShadowRadius(drop, 900)).toBe(0);
    expect(dropShadowRadius(drop, 1550)).toBeCloseTo(8);
    expect(dropShadowRadius(drop, 2100)).toBe(16);
    expect(dropShadowRadius(drop, 5000)).toBe(16);
  });
});

describe('zrzuty w biomach', () => {
  it('tylko Pajęcze leże ma pająki z sufitu', () => {
    expect(BIOMES[BiomeId.SpiderLair].ceilingDrops).not.toBeNull();
    expect(BIOMES[BiomeId.TowerRuins].ceilingDrops).toBeNull();
  });

  it('telegraf daje czas na wyjście z cienia, a spadający pająk pojawia się dopiero w jego końcówce', () => {
    const drops = BIOMES[BiomeId.SpiderLair].ceilingDrops!;
    // Gracz (200 px/s) w czasie telegrafu wychodzi z cienia nawet z jego środka.
    expect((200 * drops.telegraphMs) / 1000).toBeGreaterThan(drops.radius * 3);
    expect(drops.fallMs).toBeLessThan(drops.telegraphMs);
  });
});
