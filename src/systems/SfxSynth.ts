import type { SoundRecipe, SynthLayer } from '@/core/audioTypes';
import { createRng } from '@/core/random';

/** Długość efektu (s): najdłuższa warstwa z opóźnieniem, atakiem i wygasaniem. */
export function recipeDuration(recipe: SoundRecipe): number {
  return Math.max(0, ...recipe.layers.map((layer) => (layer.delay ?? 0) + layer.attack + layer.decay));
}

/**
 * Synteza efektu do próbek (krok 116), w duchu jsfxr: każda warstwa to fala z przesuwem wysokości,
 * obwiednią i filtrem; warstwy się sumują. Szum ma własny RNG z seeda — ten sam przepis daje zawsze
 * te same próbki (bufor można policzyć raz i trzymać w pamięci podręcznej).
 */
export function renderSound(recipe: SoundRecipe, sampleRate: number, seed = 1): Float32Array<ArrayBuffer> {
  const length = Math.max(1, Math.ceil(recipeDuration(recipe) * sampleRate));
  const out = new Float32Array(length);
  recipe.layers.forEach((layer, index) => addLayer(out, layer, sampleRate, seed + index * 7919));
  let peak = 0;
  for (let i = 0; i < length; i++) {
    out[i] = (out[i] ?? 0) * recipe.gain;
    peak = Math.max(peak, Math.abs(out[i] ?? 0));
  }
  // Suma warstw może przekroczyć zakres — wtedy skalujemy całość (bez przesterowania).
  if (peak > 0.98) {
    const scale = 0.98 / peak;
    for (let i = 0; i < length; i++) out[i] = (out[i] ?? 0) * scale;
  }
  return out;
}

function addLayer(out: Float32Array, layer: SynthLayer, sampleRate: number, seed: number): void {
  const rng = createRng(seed);
  const start = Math.round((layer.delay ?? 0) * sampleRate);
  const span = layer.attack + layer.decay;
  const count = Math.ceil(span * sampleRate);
  const freqEnd = layer.freqEnd ?? layer.freq;
  const ratio = freqEnd / layer.freq;
  const duty = layer.duty ?? 0.5;
  const curve = layer.curve ?? 1;
  const smoothing = layer.lowpass ? 1 - Math.exp((-2 * Math.PI * layer.lowpass) / sampleRate) : 1;
  let phase = 0;
  let noise = rng.next() * 2 - 1;
  let filtered = 0;
  for (let i = 0; i < count && start + i < out.length; i++) {
    const t = i / sampleRate;
    const progress = span > 0 ? t / span : 1;
    let freq = layer.freq * Math.pow(ratio, progress);
    if (layer.vibrato) freq *= 1 + layer.vibrato.depth * Math.sin(2 * Math.PI * layer.vibrato.rate * t);
    phase += freq / sampleRate;
    if (phase >= 1) {
      phase -= Math.floor(phase);
      noise = rng.next() * 2 - 1;
    }
    const raw = oscillator(layer.wave, phase, duty, noise);
    filtered += smoothing * (raw - filtered);
    const env = t < layer.attack ? t / layer.attack : Math.pow(Math.max(0, 1 - (t - layer.attack) / layer.decay), curve);
    out[start + i] = (out[start + i] ?? 0) + filtered * env * layer.volume;
  }
}

function oscillator(wave: SynthLayer['wave'], phase: number, duty: number, noise: number): number {
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase);
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5);
    case 'square':
      return phase < duty ? 1 : -1;
    case 'saw':
      return 2 * phase - 1;
    case 'noise':
      return noise;
  }
}
