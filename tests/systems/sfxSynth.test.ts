import { describe, expect, it } from 'vitest';
import type { SoundRecipe } from '@/core/audioTypes';
import { LoopCue, SoundCue } from '@/core/audioTypes';
import { LOOP_RECIPES, SOUND_GATE_RULES, SOUND_RECIPES } from '@/config/audioConfig';
import { recipeDuration, renderSound } from '@/systems/SfxSynth';

const RATE = 22050;
const rms = (s: Float32Array) => Math.sqrt(s.reduce((sum, v) => sum + v * v, 0) / s.length);
const peak = (s: Float32Array) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('renderSound (krok 116)', () => {
  const beep: SoundRecipe = { gain: 0.5, layers: [{ wave: 'square', freq: 440, attack: 0.01, decay: 0.1, volume: 1 }] };

  it('długość = najdłuższa warstwa z opóźnieniem', () => {
    const recipe: SoundRecipe = { gain: 1, layers: [...beep.layers, { wave: 'sine', freq: 200, delay: 0.2, attack: 0, decay: 0.1, volume: 1 }] };
    expect(recipeDuration(recipe)).toBeCloseTo(0.3, 9);
    expect(renderSound(recipe, RATE).length).toBe(Math.ceil(recipeDuration(recipe) * RATE));
  });

  it('ten sam przepis i seed — te same próbki (także szum)', () => {
    const noise: SoundRecipe = { gain: 1, layers: [{ wave: 'noise', freq: 8000, attack: 0, decay: 0.1, volume: 1 }] };
    expect(Array.from(renderSound(noise, RATE, 3))).toEqual(Array.from(renderSound(noise, RATE, 3)));
    expect(Array.from(renderSound(noise, RATE, 3))).not.toEqual(Array.from(renderSound(noise, RATE, 4)));
  });

  it('nie przesterowuje: suma głośnych warstw skalowana do zakresu', () => {
    const loud: SoundRecipe = { gain: 1, layers: [0, 1, 2].map(() => ({ wave: 'square', freq: 220, attack: 0, decay: 0.05, volume: 1 }) as const) };
    expect(peak(renderSound(loud, RATE))).toBeLessThanOrEqual(0.98 + 1e-6);
  });

  it('obwiednia: cisza na samym końcu (bez trzasku)', () => {
    const s = renderSound(beep, RATE);
    expect(Math.abs(s[s.length - 1] ?? 1)).toBeLessThan(0.02);
  });
});

describe('przepisy efektów z configu', () => {
  it.each(Object.values(SoundCue))('%s: słyszalny, krótki, w zakresie', (cue) => {
    const recipe = SOUND_RECIPES[cue];
    const samples = renderSound(recipe, RATE);
    expect(recipeDuration(recipe)).toBeLessThanOrEqual(2);
    expect(rms(samples)).toBeGreaterThan(0.005);
    expect(peak(samples)).toBeLessThanOrEqual(1);
    expect(SOUND_GATE_RULES[cue].minGapMs).toBeGreaterThan(0);
  });

  it.each(Object.values(LoopCue))('pętla %s: równa głośność do końca (szew bez dziury)', (cue) => {
    const samples = renderSound(LOOP_RECIPES[cue], RATE);
    const quarter = Math.floor(samples.length / 4);
    expect(rms(samples.subarray(samples.length - quarter))).toBeGreaterThan(rms(samples.subarray(0, quarter)) * 0.7);
  });
});
