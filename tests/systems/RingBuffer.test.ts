import { describe, expect, it } from 'vitest';
import { RingBuffer } from '@/systems/RingBuffer';

describe('RingBuffer (FIFO)', () => {
  it('do zapełnienia niczego nie wypycha', () => {
    const ring = new RingBuffer<number>(3);
    expect(ring.push(1)).toBeUndefined();
    expect(ring.push(2)).toBeUndefined();
    expect(ring.push(3)).toBeUndefined();
    expect(ring.size).toBe(3);
    expect(ring.toArray()).toEqual([1, 2, 3]);
  });

  it('po zapełnieniu wypycha najstarszy, kolejność od najstarszego', () => {
    const ring = new RingBuffer<string>(3);
    for (const s of ['a', 'b', 'c']) ring.push(s);
    expect(ring.push('d')).toBe('a');
    expect(ring.push('e')).toBe('b');
    expect(ring.toArray()).toEqual(['c', 'd', 'e']);
    expect(ring.size).toBe(3);
  });

  it('długi przebieg: rozmiar nie rośnie ponad pojemność, zostają najnowsze', () => {
    const ring = new RingBuffer<number>(180);
    let evicted = 0;
    for (let i = 0; i < 1000; i++) if (ring.push(i) !== undefined) evicted++;
    expect(ring.size).toBe(180);
    expect(evicted).toBe(1000 - 180);
    expect(ring.toArray()[0]).toBe(820);
    expect(ring.toArray().at(-1)).toBe(999);
  });

  it('recykling: najstarszy wstawiony ponownie staje się najnowszym (pula obiektów bez tworzenia nowych)', () => {
    const ring = new RingBuffer<{ id: number }>(3);
    const objects = [{ id: 1 }, { id: 2 }, { id: 3 }];
    for (const o of objects) ring.push(o);
    expect(ring.isFull).toBe(true);
    const reused = ring.oldest()!;
    expect(reused.id).toBe(1);
    expect(ring.push(reused)).toBe(reused);
    expect(ring.toArray().map((o) => o.id)).toEqual([2, 3, 1]);
    expect(new Set(ring.toArray()).size).toBe(3);
  });

  it('pojemność musi być dodatnią liczbą całkowitą', () => {
    expect(() => new RingBuffer(0)).toThrow();
    expect(() => new RingBuffer(2.5)).toThrow();
  });
});
