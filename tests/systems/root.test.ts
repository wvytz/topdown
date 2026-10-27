import { describe, expect, it } from 'vitest';
import { RootState } from '@/systems/Root';

const ROOT = { durationMs: 1000, immunityMs: 2000 };

describe('unieruchomienie (krok 126)', () => {
  it('trwa durationMs, potem bohater jest wolny', () => {
    const root = new RootState();
    expect(root.apply(ROOT, 0)).toBe(true);
    expect(root.isRooted(999)).toBe(true);
    expect(root.remaining(400)).toBe(600);
    expect(root.isRooted(1000)).toBe(false);
  });

  it('nie przedłuża się w trakcie i daje odporność po zakończeniu', () => {
    const root = new RootState();
    root.apply(ROOT, 0);
    expect(root.apply(ROOT, 500)).toBe(false);
    expect(root.isRooted(1200)).toBe(false);
    expect(root.apply(ROOT, 2999)).toBe(false);
    expect(root.apply(ROOT, 3000)).toBe(true);
  });

  it('clear zwalnia od razu, ale odporność zostaje', () => {
    const root = new RootState();
    root.apply(ROOT, 0);
    root.clear();
    expect(root.isRooted(10)).toBe(false);
    expect(root.apply(ROOT, 10)).toBe(false);
  });
});
