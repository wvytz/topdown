import type { SoundRecipe } from '@/core/audioTypes';

export interface SfxTone {
  /** Mnożnik wszystkich częstotliwości (< 1 — niżej). */
  readonly pitchScale: number;
  /** Najwyższy filtr warstwy (Hz); warstwy bez filtra też go dostają. */
  readonly maxLowpassHz: number;
}

/**
 * Wspólna barwa efektów (krok 116a): przepis gra niżej i ciemniej, bez przepisywania każdego z osobna.
 * Długości i obwiednie zostają — zmienia się tylko wysokość i jasność.
 */
export function applySfxTone(recipe: SoundRecipe, tone: SfxTone): SoundRecipe {
  return {
    ...recipe,
    layers: recipe.layers.map((layer) => ({
      ...layer,
      freq: layer.freq * tone.pitchScale,
      ...(layer.freqEnd !== undefined && { freqEnd: layer.freqEnd * tone.pitchScale }),
      lowpass: Math.min(layer.lowpass ?? Infinity, tone.maxLowpassHz),
    })),
  };
}
