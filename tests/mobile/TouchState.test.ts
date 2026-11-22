import { describe, expect, it } from 'vitest';
import { TouchState } from '@/mobile/TouchState';

describe('TouchState — ostrzał automatyczny łucznika (krok U12c)', () => {
  it('startuje wyłączony, a puszczenie wszystkiego (pauza, śmierć, nowe piętro) go wyłącza', () => {
    const state = new TouchState();
    expect(state.fireLock).toBe(false);
    state.fireLock = true;
    state.release();
    expect(state.fireLock).toBe(false);
  });
});
