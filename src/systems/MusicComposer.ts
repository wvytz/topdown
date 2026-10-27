import type { MusicNote, MusicThemeDefinition } from '@/core/audioTypes';
import { createRng, deriveSeed } from '@/core/random';

const BEATS_PER_BAR = 4;
/** Po tylu przejściach progresji melodia dzwonków zaczyna się od nowa — utwór ma rozpoznawalną pętlę. */
const PROGRESSION_LOOPS_PER_CYCLE = 2;

/** Długość taktu (s). */
export function barDuration(theme: MusicThemeDefinition): number {
  return (BEATS_PER_BAR * 60) / theme.bpm;
}

/** Wysokość (MIDI) stopnia skali; stopnie poza skalą przechodzą do kolejnej oktawy. */
export function scaleDegreeMidi(theme: MusicThemeDefinition, degree: number): number {
  const size = theme.scale.length;
  const octave = Math.floor(degree / size);
  const step = theme.scale[((degree % size) + size) % size] ?? 0;
  return theme.root + step + 12 * octave;
}

/** Stopień skali, na którym stoi akord taktu `bar`. */
export function chordDegree(theme: MusicThemeDefinition, bar: number): number {
  const index = Math.floor(bar / theme.barsPerChord) % theme.progression.length;
  return theme.progression[index] ?? 0;
}

/**
 * Nuty jednego taktu (krok 116). Utwór składa się w locie, ale deterministycznie: akordy z progresji (pad i bas),
 * nad nimi rzadkie dzwonki z dźwięków akordu, a w walce z bossem (albo zawsze w zaświatach) puls bębna.
 * Czysta funkcja — odtwarzacz tylko zamienia nuty na dźwięk.
 */
export function composeBar(theme: MusicThemeDefinition, bar: number, intense: boolean): MusicNote[] {
  const beat = 60 / theme.bpm;
  const barLength = barDuration(theme);
  const degree = chordDegree(theme, bar);
  const triad = [degree, degree + 2, degree + 4];
  const notes: MusicNote[] = [];

  if (bar % theme.barsPerChord === 0) {
    for (const tone of triad) {
      notes.push({ voice: 'pad', at: 0, midi: scaleDegreeMidi(theme, tone) + 12, duration: barLength * theme.barsPerChord, velocity: 0.5 });
    }
  }
  notes.push({ voice: 'bass', at: 0, midi: scaleDegreeMidi(theme, degree) - 12, duration: barLength * 0.95, velocity: 0.6 });
  if (intense) notes.push({ voice: 'bass', at: beat * 2, midi: scaleDegreeMidi(theme, degree) - 12, duration: beat * 1.5, velocity: 0.45 });

  const cycle = theme.progression.length * theme.barsPerChord * PROGRESSION_LOOPS_PER_CYCLE;
  const rng = createRng(deriveSeed(theme.seed, bar % cycle));
  const resting = bar % theme.bellRest.every >= theme.bellRest.every - theme.bellRest.rest;
  const density = resting ? 0 : intense ? Math.min(1, theme.bellDensity * 1.6) : theme.bellDensity;
  for (let eighth = 0; eighth < BEATS_PER_BAR * 2; eighth++) {
    if (!rng.chance(density)) continue;
    const tone = triad[rng.int(0, triad.length - 1)] ?? degree;
    notes.push({
      voice: 'bell',
      at: (eighth * beat) / 2,
      midi: scaleDegreeMidi(theme, tone) + theme.bellTranspose,
      duration: beat * 1.5,
      velocity: 0.3 + rng.next() * 0.2,
    });
  }

  if (theme.drumAlways || intense) {
    for (const b of theme.drumBeats) notes.push({ voice: 'drum', at: b * beat, midi: 36, duration: beat * 0.8, velocity: intense ? 0.8 : 0.5 });
  }
  return notes;
}
