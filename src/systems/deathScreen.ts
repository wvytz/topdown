import type { DeathFlowGroup, DeathTiming, DeathTitleFlow } from '@/config/deathScreenConfig';
import { DEATH_TIMING, DEATH_TITLE_FLOW } from '@/config/deathScreenConfig';

/** Stan ekranu śmierci w chwili `t` (ms od śmierci) — HUD tylko go rysuje. */
export interface DeathFrame {
  readonly dimAlpha: number;
  /** Czarny pas przez środek ekranu (0..1). */
  readonly bandAlpha: number;
  readonly titleAlpha: number;
  readonly titleScale: number;
  readonly scoreAlpha: number;
  /** Przezroczystość kolejnych wierszy tablicy (wchodzą po kolei). */
  readonly rowAlphas: readonly number[];
  readonly promptAlpha: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** Łagodne wejście i wyjście — bez szarpnięć. */
const smooth = (k: number): number => k * k * (3 - 2 * k);
const easeOutSine = (k: number): number => Math.sin((k * Math.PI) / 2);

/** Ekran śmierci w chwili `t`; `rows` = liczba wierszy tablicy. */
export function deathFrame(t: number, rows: number, timing: DeathTiming = DEATH_TIMING): DeathFrame {
  const sinceTitle = t - timing.titleAt;
  const sincePrompt = t - timing.promptAt;
  // Puls komunikatu: od pełnej jasności w dół do `promptMinAlpha` i z powrotem.
  const pulse = 0.5 + 0.5 * Math.cos((Math.max(0, sincePrompt) / timing.promptPulsePeriod) * Math.PI * 2);
  return {
    dimAlpha: timing.dimAlpha * smooth(clamp01(t / timing.dimDuration)),
    bandAlpha: smooth(clamp01((t - timing.bandAt) / timing.bandDuration)),
    titleAlpha: smooth(clamp01(sinceTitle / timing.titleFadeDuration)),
    titleScale: lerp(timing.titleFromScale, timing.titleToScale, easeOutSine(clamp01(sinceTitle / timing.titleGrowDuration))),
    scoreAlpha: smooth(clamp01((t - timing.scoreAt) / timing.scoreFadeDuration)),
    rowAlphas: Array.from({ length: rows }, (_, i) =>
      smooth(clamp01((t - timing.rowsAt - i * timing.rowInterval) / timing.rowFadeDuration)),
    ),
    promptAlpha: smooth(clamp01(sincePrompt / timing.promptFadeDuration)) * lerp(timing.promptMinAlpha, 1, pulse),
  };
}

/**
 * Indeks tonu rampy dla paska lica na wysokości `y` (px od góry napisu) w chwili `t` (ms):
 * wzór przesuwa się w dół z prędkością `speedPxPerSec` i zapętla bez szwu.
 */
export function titleFlowIndex(
  y: number,
  t: number,
  flow: DeathTitleFlow = DEATH_TITLE_FLOW,
  speedPxPerSec: number = flow.speedPxPerSec,
  offsetPx = 0,
): number {
  const n = flow.ramp.length;
  const shifted = y + offsetPx - (t / 1000) * speedPxPerSec;
  const band = Math.floor(shifted / flow.bandPx);
  return ((band % n) + n) % n;
}

/** Grupa spływania dla litery o indeksie `letter` (od lewej); litery spoza grup należą do ostatniej. */
export function flowGroupOf(letter: number, flow: DeathTitleFlow = DEATH_TITLE_FLOW): DeathFlowGroup {
  let first = 0;
  for (const group of flow.groups) {
    if (letter < first + group.letters) return group;
    first += group.letters;
  }
  return flow.groups[flow.groups.length - 1] ?? { letters: 1, speedPxPerSec: flow.speedPxPerSec, offsetPx: 0 };
}

export interface Particle {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

/** Krok ruchu cząstki z grawitacją (px, ms) — używa go ekran startowy (odłamki wieży, pył). */
export function stepParticle(p: Particle, dtMs: number, gravity: number): Particle {
  const vy = p.vy + gravity * dtMs;
  return { x: p.x + p.vx * dtMs, y: p.y + vy * dtMs, vx: p.vx, vy };
}
