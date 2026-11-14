import { describe, expect, it } from 'vitest';
import type { Hit } from '@/core/combatTypes';
import { resolveDashSweep, sideKnockback } from '@/systems/DashStrike';

const target = (x: number, y: number) => {
  const hits: Hit[] = [];
  return { x, y, radius: 6, hits, takeHit: (hit: Hit) => (hits.push(hit), { dealt: hit.damage, died: false }) };
};

describe('Rozdeptanie — odrzut na boki (krok U8c)', () => {
  it('prostopadle do toru dasha, w stronę, po której stoi cel', () => {
    const right = { x: 1, y: 0 };
    expect(sideKnockback({ x: 0, y: 0 }, right, { x: 3, y: 5 }, 100)).toEqual({ x: -0, y: 100 });
    expect(sideKnockback({ x: 0, y: 0 }, right, { x: 3, y: -5 }, 100)).toEqual({ x: 0, y: -100 });
  });

  it('dash z kierunkiem odrzuca, bez kierunku (Burzowy pęd) — nie; każdy cel raz na dash', () => {
    const a = target(5, 4);
    const b = target(5, -4);
    const hitSet = new Set<object>();
    resolveDashSweep({ center: { x: 0, y: 0 }, radius: 8, damage: 14, now: 0, heading: { x: 1, y: 0 }, sideKnockback: 300 }, [a, b], hitSet);
    expect(a.hits[0]!.knockback.y).toBeGreaterThan(0);
    expect(b.hits[0]!.knockback.y).toBeLessThan(0);
    resolveDashSweep({ center: { x: 0, y: 0 }, radius: 8, damage: 14, now: 1 }, [a, b], hitSet);
    expect(a.hits).toHaveLength(1);
    const c = target(2, 2);
    resolveDashSweep({ center: { x: 0, y: 0 }, radius: 8, damage: 10, now: 0 }, [c], new Set());
    expect(c.hits[0]!.knockback).toEqual({ x: 0, y: 0 });
  });
});
