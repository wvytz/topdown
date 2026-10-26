import { describe, expect, it } from 'vitest';
import { SoundGate } from '@/systems/SoundGate';

const rules = { hit: { minGapMs: 50 }, coin: { minGapMs: 40 } } as const;

describe('SoundGate (krok 116)', () => {
  it('ten sam efekt w odstępie krótszym niż minGapMs gra raz (co-op: dwa ciosy naraz)', () => {
    const gate = new SoundGate<'hit' | 'coin'>(rules, { maxPerWindow: 10, windowMs: 100 });
    expect(gate.allow('hit', 0)).toBe(true);
    expect(gate.allow('hit', 10)).toBe(false);
    expect(gate.allow('hit', 50)).toBe(true);
  });

  it('różne efekty nie blokują się nawzajem', () => {
    const gate = new SoundGate<'hit' | 'coin'>(rules, { maxPerWindow: 10, windowMs: 100 });
    expect(gate.allow('hit', 0)).toBe(true);
    expect(gate.allow('coin', 0)).toBe(true);
  });

  it('ogólny limit na okno czasu', () => {
    const gate = new SoundGate<'hit' | 'coin'>({ hit: { minGapMs: 1 }, coin: { minGapMs: 1 } }, { maxPerWindow: 3, windowMs: 100 });
    expect([0, 1, 2, 3].map((t) => gate.allow('hit', t * 2))).toEqual([true, true, true, false]);
    expect(gate.allow('coin', 100)).toBe(true);
  });
});
