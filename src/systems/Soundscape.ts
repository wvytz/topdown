import type { BiomeSoundscape, SoundscapeConfig, SoundscapeEcho } from '@/config/soundscapeConfig';
import type { SoundCue } from '@/core/audioTypes';

/**
 * Odgłosy biomów (krok 158): czysty wybór kolejnego odgłosu tła. Losowość podaje wywołujący (liczby 0..1) —
 * to efekt czysto zmysłowy, więc wystarczy Math.random, a funkcja zostaje deterministyczna i testowalna.
 */
export interface SoundscapePick {
  readonly cue: SoundCue;
  /** Obraz do odgłosu (krok 159); null — tylko dźwięk. */
  readonly echo: SoundscapeEcho | null;
  /** Przesunięcie źródła od środka kadru (px). */
  readonly dx: number;
  readonly dy: number;
  /** Za ile ms następny odgłos. */
  readonly nextInMs: number;
}

/** Trzy liczby 0..1: który odgłos, kierunek/odległość i przerwa do następnego. */
export interface SoundscapeRolls {
  readonly pick: number;
  readonly angle: number;
  readonly distance: number;
  readonly interval: number;
}

export function pickSoundscape(scape: BiomeSoundscape, config: SoundscapeConfig, rolls: SoundscapeRolls): SoundscapePick | null {
  const total = scape.entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
  if (total <= 0) return null;
  let left = clamp01(rolls.pick) * total;
  let chosen = scape.entries[scape.entries.length - 1]!;
  for (const entry of scape.entries) {
    left -= Math.max(0, entry.weight);
    if (left < 0) {
      chosen = entry;
      break;
    }
  }
  const angle = clamp01(rolls.angle) * Math.PI * 2;
  const radius = lerp(config.distancePx.min, config.distancePx.max, clamp01(rolls.distance));
  return {
    cue: chosen.cue,
    echo: chosen.echo ?? null,
    dx: Math.cos(angle) * radius,
    dy: Math.sin(angle) * radius,
    nextInMs: Math.round(lerp(scape.intervalMs.min, scape.intervalMs.max, clamp01(rolls.interval))),
  };
}

function clamp01(v: number): number {
  return Math.min(0.999999, Math.max(0, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
