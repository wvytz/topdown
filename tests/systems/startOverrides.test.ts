import { describe, expect, it } from 'vitest';
import { parseStartOverrides } from '@/systems/startOverrides';
import { RunState, newRun } from '@/systems/RunState';
import { HeroId } from '@/core/heroTypes';

describe('start z adresu — run testowy (krok 41g)', () => {
  it('bez parametrów: zwykły run', () => {
    expect(parseStartOverrides('')).toEqual({ practice: false });
    expect(parseStartOverrides('?hero=sorceress')).toEqual({ practice: false });
  });

  it('piętro > 1 albo seed: run testowy', () => {
    expect(parseStartOverrides('?floor=6&hero=sorceress')).toEqual({ floor: 6, practice: true });
    expect(parseStartOverrides('?seed=3')).toEqual({ runSeed: 3, practice: true });
    expect(parseStartOverrides('?floor=1')).toEqual({ floor: 1, practice: false });
  });

  it('błędne wartości są pomijane', () => {
    expect(parseStartOverrides('?floor=0&seed=abc')).toEqual({ practice: false });
    expect(parseStartOverrides('?floor=2.5&seed=')).toEqual({ practice: false });
  });

  it('znacznik testowego runu przechodzi przez kolejne piętra', () => {
    const run = new RunState(newRun(HeroId.Sorceress, true));
    expect(run.snapshot(10).practice).toBe(true);
    expect(new RunState(newRun(HeroId.Barbarian)).snapshot(null).practice).toBe(false);
  });
});
