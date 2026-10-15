import type { SplashTiming } from '@/config/splashConfig';
import { SPLASH_TIMING } from '@/config/splashConfig';

/** Stan ekranu startowego w danej chwili — scena Phasera tylko go rysuje. */
export interface SplashFrame {
  /** Zaciemnienie całego ekranu: 1 = czerń (ciemność przed tłem, wygaszenie na końcu). */
  readonly blackout: number;
  /** Jasność pioruna (0..1) — rozjaśnia ekran i na moment odsłania sylwetkę wieży. */
  readonly lightning: number;
  /** Słowa tytułu: widoczność i skala (uderzenie z odbiciem), w kolejności `wordSlamAt`. */
  readonly words: readonly { readonly visible: boolean; readonly scale: number }[];
  readonly flashAlpha: number;
  /** Poświata za logo i promienie światła (0..1). */
  readonly glowAlpha: number;
  readonly raysAlpha: number;
  /** Położenie połysku na literach 0..1 (od lewej do prawej) albo null, gdy go nie ma. */
  readonly shine: number | null;
  readonly eyesOn: boolean;
  readonly lateEyesOn: boolean;
  /** Ile znaków podtytułu już widać (bez górnego limitu — scena przycina do długości napisu). */
  readonly subtitleChars: number;
  /** Koniec wygaszenia — czas uruchomić pierwszą planszę. */
  readonly done: boolean;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** Chwile uderzeń słów (błysk, wstrząs kamery), w kolejności słów. */
export function splashImpacts(timing: SplashTiming = SPLASH_TIMING): number[] {
  return timing.wordSlamAt.map((at) => at + timing.slamDuration);
}

function wordScaleAt(t: number, slamAt: number, timing: SplashTiming): number {
  const impact = slamAt + timing.slamDuration;
  if (t < impact) {
    const k = easeOutCubic(clamp01((t - slamAt) / timing.slamDuration));
    return lerp(timing.slamFromScale, timing.slamUndershoot, k);
  }
  const half = timing.settleDuration / 2;
  const s = t - impact;
  if (s < half) return lerp(timing.slamUndershoot, timing.slamOvershoot, s / half);
  if (s < timing.settleDuration) return lerp(timing.slamOvershoot, 1, (s - half) / half);
  return 1;
}

function lightningAt(t: number, timing: SplashTiming): number {
  return Math.max(
    0,
    ...timing.lightningAt.map((at, i) =>
      t < at ? 0 : (timing.lightningPeak[i] ?? 0) * (1 - clamp01((t - at) / timing.lightningDecay)),
    ),
  );
}

/** Błysk po uderzeniu: każde uderzenie ma własną siłę, liczy się najjaśniejszy. */
function flashAt(t: number, timing: SplashTiming): number {
  return Math.max(
    0,
    ...splashImpacts(timing).map((impact, i) =>
      t < impact ? 0 : (timing.flashAlpha[i] ?? 0) * (1 - clamp01((t - impact) / timing.flashDuration)),
    ),
  );
}

function eyesAt(t: number, start: number, timing: SplashTiming): boolean {
  if (t < start) return false;
  const phase = (t - start) % timing.blinkPeriod;
  return !(phase >= timing.blinkOffset && phase < timing.blinkOffset + timing.blinkLength);
}

/**
 * Klatka ekranu startowego w chwili `t` (ms od startu).
 * `fadeFrom` = chwila rozpoczęcia wygaszenia albo null, gdy jeszcze go nie zaczęto (patrz `splashFadeStart`).
 */
export function splashFrame(t: number, fadeFrom: number | null, timing: SplashTiming = SPLASH_TIMING): SplashFrame {
  const impacts = splashImpacts(timing);
  const lastImpact = impacts[impacts.length - 1] ?? 0;
  const firstImpact = impacts[0] ?? 0;
  const fade = fadeFrom === null ? 0 : clamp01((t - fadeFrom) / timing.fadeOutDuration);
  const dark = 1 - clamp01((t - timing.backdropAt) / timing.backdropIn);
  const lightning = lightningAt(t, timing);
  const shineK = (t - timing.shineAt) / timing.shineDuration;
  return {
    // Piorun odsłania tło przez ciemność; wygaszenie na końcu wygrywa ze wszystkim.
    blackout: Math.max(Math.min(dark, 1 - lightning), fade),
    lightning,
    words: timing.wordSlamAt.map((at) => ({ visible: t >= at, scale: wordScaleAt(t, at, timing) })),
    flashAlpha: flashAt(t, timing),
    glowAlpha: t < firstImpact ? 0 : t < lastImpact ? 0.5 : 1,
    raysAlpha: clamp01((t - lastImpact) / timing.raysFadeIn),
    shine: shineK >= 0 && shineK <= 1 ? shineK : null,
    eyesOn: eyesAt(t, timing.eyesAt, timing),
    lateEyesOn: eyesAt(t, timing.eyesAt + timing.lateEyesDelay, timing),
    subtitleChars: t < timing.subtitleAt ? 0 : Math.floor((t - timing.subtitleAt) / timing.subtitleCharMs),
    done: fadeFrom !== null && t >= fadeFrom + timing.fadeOutDuration,
  };
}

export interface SplashFadeInput {
  /** Bieżący czas (ms od startu ekranu). */
  readonly t: number;
  /** Chwila rozpoczęcia wygaszenia ustalona wcześniej (albo null). */
  readonly fadeFrom: number | null;
  /** Gra skończyła ładować zasoby (BootScene). */
  readonly bootReady: boolean;
  /** Gracz nacisnął klawisz albo kliknął — pomija resztę ekranu. */
  readonly skipRequested: boolean;
}

/**
 * Kiedy zacząć wygaszenie: po zaplanowanym czasie albo od razu po pominięciu,
 * ale nigdy przed załadowaniem gry — wtedy tytuł po prostu trzyma się dłużej.
 */
export function splashFadeStart(input: SplashFadeInput, timing: SplashTiming = SPLASH_TIMING): number | null {
  if (input.fadeFrom !== null) return input.fadeFrom;
  if (!input.bootReady) return null;
  if (input.skipRequested || input.t >= timing.fadeOutAt) return input.t;
  return null;
}
