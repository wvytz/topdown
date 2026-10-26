import { describe, expect, it } from 'vitest';
import type { SoundRecipe } from '@/core/audioTypes';
import { SoundCue } from '@/core/audioTypes';
import { SFX_TONE, SOUND_RECIPES } from '@/config/audioConfig';
import { applySfxTone } from '@/systems/SfxTone';
import { recipeDuration, renderSound } from '@/systems/SfxSynth';

describe('applySfxTone (krok 116a)', () => {
  const recipe: SoundRecipe = {
    gain: 1,
    layers: [
      { wave: 'square', freq: 1000, freqEnd: 500, attack: 0, decay: 0.1, volume: 1 },
      { wave: 'noise', freq: 8000, attack: 0, decay: 0.1, volume: 1, lowpass: 1500 },
    ],
  };

  it('obniża wysokość i ogranicza filtr; długość bez zmian', () => {
    const soft = applySfxTone(recipe, { pitchScale: 0.5, maxLowpassHz: 2000 });
    expect(soft.layers[0]).toMatchObject({ freq: 500, freqEnd: 250, lowpass: 2000 });
    expect(soft.layers[1]).toMatchObject({ freq: 4000, lowpass: 1500 });
    expect(recipeDuration(soft)).toBe(recipeDuration(recipe));
  });

  it.each(Object.values(SoundCue))('%s po złagodzeniu nadal słyszalny', (cue) => {
    const samples = renderSound(applySfxTone(SOUND_RECIPES[cue], SFX_TONE), 22050);
    const rms = Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length);
    expect(rms).toBeGreaterThan(0.004);
  });
});
