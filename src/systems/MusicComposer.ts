import type { MusicNote, MusicThemeDefinition } from '@/core/audioTypes';
import { createRng, deriveSeed } from '@/core/random';

const BEATS_PER_BAR = 4;
/** Kroki sekwencera w takcie (szesnastki). */
export const STEPS_PER_BAR = 16;
const KICK_STEPS = [0, 4, 8, 12];

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
export function isBreakdown(theme: MusicThemeDefinition, bar: number, intense: boolean): boolean {
  return !intense && bar % theme.phraseBars >= theme.phraseBars - theme.breakBars;
}

/**
 * Nuty jednego taktu (krok 139: minimalny house w klimacie horroru, wcześniej ambient z kroku 116).
 * Stopa na każdą ćwierćnutę, otwarty hi-hat na offbeat, klask na 2 i 4, toczący się bas z progresji,
 * krótki mroczny stab, pod spodem dron z interwałem grozy, a co jakiś czas „ping” w pogłosie.
 * Fraza kończy się przełamaniem (sam dron, hi-haty i stab), wstęp nie ma klasku ani staba.
 * W walce z bossem: szesnastkowe hi-haty, stab w każdym takcie, gęstsze pingi, bez przełamań.
 * Czysta funkcja — odtwarzacz tylko zamienia nuty na dźwięk.
 */
export function composeBar(theme: MusicThemeDefinition, bar: number, intense: boolean): MusicNote[] {
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
