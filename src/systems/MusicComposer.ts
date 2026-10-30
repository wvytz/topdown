import type { HorrorThemeDefinition, LucentThemeDefinition, MusicNote, MusicThemeDefinition } from '@/core/audioTypes';
import { MusicPreset } from '@/core/audioTypes';
import { createRng, deriveSeed } from '@/core/random';

const BEATS_PER_BAR = 4;
/** Kroki sekwencera w takcie (szesnastki). */
export const STEPS_PER_BAR = 16;
const KICK_STEPS = [0, 4, 8, 12];
/** Lucent: po tylu przejściach progresji melodia dzwonków zaczyna się od nowa — utwór ma rozpoznawalną pętlę. */
const PROGRESSION_LOOPS_PER_CYCLE = 2;

/** Długość taktu (s). */
export function barDuration(theme: MusicThemeDefinition): number {
  return (BEATS_PER_BAR * 60) / theme.bpm;
}

/** Długość kroku sekwencera (s). */
export function stepDuration(theme: MusicThemeDefinition): number {
  return barDuration(theme) / STEPS_PER_BAR;
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

/** Ostatnie takty frazy to przełamanie (w walce z bossem go nie ma — muzyka nie odpuszcza). */
export function isBreakdown(theme: HorrorThemeDefinition, bar: number, intense: boolean): boolean {
  return !intense && bar % theme.phraseBars >= theme.phraseBars - theme.breakBars;
}

/** Nuty jednego taktu w stylu zestawu utworu. Czysta funkcja — odtwarzacz tylko zamienia nuty na dźwięk. */
export function composeBar(theme: MusicThemeDefinition, bar: number, intense: boolean): MusicNote[] {
  return theme.preset === MusicPreset.Horror ? composeHorrorBar(theme, bar, intense) : composeLucentBar(theme, bar, intense);
}

/**
 * Lucent (krok 116). Utwór składa się w locie, ale deterministycznie: akordy z progresji (pad i bas),
 * nad nimi rzadkie dzwonki z dźwięków akordu, a w walce z bossem (albo zawsze w zaświatach) puls bębna.
 */
export function composeLucentBar(theme: LucentThemeDefinition, bar: number, intense: boolean): MusicNote[] {
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

/**
 * Horror (krok 139): minimalny house w klimacie horroru.
 * Stopa na każdą ćwierćnutę, otwarty hi-hat na offbeat, klask na 2 i 4, toczący się bas z progresji,
 * krótki mroczny stab, pod spodem dron z interwałem grozy, a co jakiś czas „ping” w pogłosie.
 * Fraza kończy się przełamaniem (sam dron, hi-haty i stab), wstęp nie ma klasku ani staba.
 * W walce z bossem: szesnastkowe hi-haty, stab w każdym takcie, gęstsze pingi, bez przełamań.
 */
export function composeHorrorBar(theme: HorrorThemeDefinition, bar: number, intense: boolean): MusicNote[] {
  const step = stepDuration(theme);
  const degree = chordDegree(theme, bar);
  const chordRoot = scaleDegreeMidi(theme, degree);
  const breakdown = isBreakdown(theme, bar, intense);
  const intro = !intense && bar < theme.introBars;
  const notes: MusicNote[] = [];
  const at = (s: number): number => s * step;

  if (bar % theme.barsPerChord === 0) {
    const duration = barDuration(theme) * theme.barsPerChord;
    notes.push({ voice: 'drone', at: 0, midi: chordRoot, duration, velocity: 0.6 });
    notes.push({ voice: 'drone', at: 0, midi: chordRoot + theme.droneTension, duration, velocity: 0.35 });
  }

  if (!breakdown) {
    for (const s of KICK_STEPS) notes.push({ voice: 'kick', at: at(s), midi: 36, duration: step * 2, velocity: s === 0 ? 1 : 0.9 });
    theme.bassSteps.forEach((offset, s) => {
      if (offset === null) return;
      notes.push({ voice: 'bass', at: at(s), midi: scaleDegreeMidi(theme, degree + offset) - 12, duration: step * 1.5, velocity: 0.8 });
    });
    if (!intro) for (const s of theme.clapSteps) notes.push({ voice: 'clap', at: at(s), midi: 39, duration: step, velocity: 0.8 });
  }

  for (const s of theme.openHatSteps) notes.push({ voice: 'openHat', at: at(s), midi: 46, duration: step * 2, velocity: breakdown ? 0.5 : 0.8 });
  if (intense) {
    for (let s = 1; s < STEPS_PER_BAR; s += 2) notes.push({ voice: 'hat', at: at(s), midi: 42, duration: step / 2, velocity: s % 4 === 3 ? 0.7 : 0.45 });
  }

  if (!intro && (intense || bar % 2 === 1)) {
    for (const s of theme.stabSteps) {
      for (const tone of [degree, degree + 2, degree + 4]) {
        notes.push({ voice: 'stab', at: at(s), midi: scaleDegreeMidi(theme, tone) + 12, duration: step * 2, velocity: 0.7 });
      }
    }
  }

  const rng = createRng(deriveSeed(theme.seed, bar % theme.phraseBars));
  const pingChance = intense ? Math.min(1, theme.pingChance * 1.6) : theme.pingChance;
  if (!intro && rng.chance(pingChance)) {
    const s = rng.int(0, STEPS_PER_BAR - 1);
    // Ping raz na kwintę, raz na interwał grozy — nigdy nie wiadomo, który.
    const interval = rng.chance(0.5) ? 7 : theme.droneTension;
    notes.push({ voice: 'ping', at: at(s), midi: chordRoot + theme.pingTranspose + interval, duration: step * 4, velocity: 0.5 + rng.next() * 0.3 });
  }
  return notes;
}
