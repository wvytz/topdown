import { describe, expect, it } from 'vitest';
import { ReviveProgress, reviveHp } from '@/systems/Revive';

const config = { radiusPx: 30, durationMs: 3000, decaySlowdown: 3, hpFraction: 0.4 };
const downed = { x: 0, y: 0 };
const near = { x: 20, y: 0 };
const far = { x: 100, y: 0 };

describe('wskrzeszanie (co-op, etap C4)', () => {
  it('partner obok wskrzesza po pełnym czasie', () => {
    const revive = new ReviveProgress(config);
    expect(revive.update({ downed, helpers: [near], dtMs: 2000 })).toBe(false);
    expect(revive.progress).toBeCloseTo(2 / 3);
    expect(revive.update({ downed, helpers: [near], dtMs: 1000 })).toBe(true);
    expect(revive.progress).toBe(0);
  });

  it('bez partnera obok nic się nie dzieje', () => {
    const revive = new ReviveProgress(config);
    expect(revive.update({ downed, helpers: [far], dtMs: 10_000 })).toBe(false);
    expect(revive.update({ downed, helpers: [], dtMs: 10_000 })).toBe(false);
    expect(revive.progress).toBe(0);
  });

  it('odejście cofa postęp trzy razy wolniej', () => {
    const revive = new ReviveProgress(config);
    revive.update({ downed, helpers: [near], dtMs: 1500 });
    revive.update({ downed, helpers: [far], dtMs: 1500 });
    expect(revive.progress).toBeCloseTo(1000 / 3000);
    revive.update({ downed, helpers: [far], dtMs: 60_000 });
    expect(revive.progress).toBe(0);
  });

  it('HP po wstaniu to 40% maksimum, co najmniej 1', () => {
    expect(reviveHp(100, config)).toBe(40);
    expect(reviveHp(1, config)).toBe(1);
  });
});
