import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '@/core/random';

describe('createRng', () => {
  it('ten sam seed daje tę samą sekwencję', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('next() mieści się w [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() zwraca wartości z domkniętego zakresu i trafia w oba końce', () => {
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });
});

describe('deriveSeed', () => {
  it('jest deterministyczny i rozróżnia piętra', () => {
    expect(deriveSeed(123, 1)).toBe(deriveSeed(123, 1));
    expect(deriveSeed(123, 1)).not.toBe(deriveSeed(123, 2));
    expect(deriveSeed(123, 1)).not.toBe(deriveSeed(124, 1));
  });
});
