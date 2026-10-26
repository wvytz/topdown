import { describe, expect, it } from 'vitest';
import { exposedArcs } from '@/systems/AreaOutline';

const total = (arcs: { start: number; end: number }[]): number => arcs.reduce((sum, arc) => sum + arc.end - arc.start, 0);

describe('obrys sumy kół (krok 110)', () => {
  it('samotne koło ma pełny obrys', () => {
    const circle = { center: { x: 0, y: 0 }, radius: 10 };
    expect(exposedArcs(circle, [circle])).toEqual([{ start: 0, end: Math.PI * 2 }]);
  });

  it('koła rozłączne nie zasłaniają sobie obrysu', () => {
    const a = { center: { x: 0, y: 0 }, radius: 10 };
    const b = { center: { x: 50, y: 0 }, radius: 10 };
    expect(total(exposedArcs(a, [a, b]))).toBeCloseTo(Math.PI * 2);
  });

  it('w łańcuchu środkowe koło ma tylko dwa boczne łuki, a skrajne jeden', () => {
    const chain = [0, 14, 28].map((x) => ({ center: { x, y: 0 }, radius: 14 }));
    const [left, middle, right] = chain;
    if (!left || !middle || !right) throw new Error('łańcuch');
    expect(exposedArcs(middle, chain)).toHaveLength(2);
    expect(exposedArcs(left, chain)).toHaveLength(1);
    expect(exposedArcs(right, chain)).toHaveLength(1);
    // Łuk skrajnego z prawej przechodzi przez kąt 0 — zostaje jednym łukiem.
    const [arc] = exposedArcs(right, chain);
    expect(arc && Math.cos((arc.start + arc.end) / 2)).toBeCloseTo(1);
  });

  it('kopia koła z grupy liczy się jak ono samo', () => {
    const a = { center: { x: 0, y: 0 }, radius: 10 };
    const b = { center: { x: 50, y: 0 }, radius: 10 };
    expect(exposedArcs({ center: { x: 0, y: 0 }, radius: 10 }, [a, b])).toEqual([{ start: 0, end: Math.PI * 2 }]);
  });

  it('koło całkiem w środku większego nie ma obrysu', () => {
    const big = { center: { x: 0, y: 0 }, radius: 40 };
    const small = { center: { x: 5, y: 0 }, radius: 10 };
    expect(exposedArcs(small, [big, small])).toEqual([]);
  });
});
