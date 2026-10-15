import type { SplashTiming } from '@/config/splashConfig';
import { SPLASH_TIMING } from '@/config/splashConfig';

/** Stan ekranu startowego w danej chwili — scena Phasera tylko go rysuje. */
export interface SplashFrame {
  /** Zaciemnienie całego ekranu: 1 = czerń (wejście tła i wygaszenie na końcu). */
  readonly blackout: number;
  readonly titleVisible: boolean;
  readonly titleScale: number;
  readonly flashAlpha: number;
  /** Poświata za logo (0..1). */
  readonly glowAlpha: number;
  readonly towerAlpha: number;
  /** Przesunięcie „TOWER” w górę w pikselach (0 = na miejscu). */
  readonly towerOffsetY: number;
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

/** Chwila uderzenia napisu (błysk, wstrząs kamery). */
export function splashImpactAt(timing: SplashTiming = SPLASH_TIMING): number {
  return timing.slamAt + timing.slamDuration;
}

function titleScaleAt(t: number, timing: SplashTiming): number {
  const impact = splashImpactAt(timing);
  if (t < impact) {
    const k = easeOutCubic(clamp01((t - timing.slamAt) / timing.slamDuration));
    return lerp(timing.slamFromScale, timing.slamUndershoot, k);
  }
  const half = timing.settleDuration / 2;
  const s = t - impact;
  if (s < half) return lerp(timing.slamUndershoot, timing.slamOvershoot, s / half);
  if (s < timing.settleDuration) return lerp(timing.slamOvershoot, 1, (s - half) / half);
  return 1;
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
export function splashFrame(
  t: number,
  fadeFrom: number | null,
  timing: SplashTiming = SPLASH_TIMING,
): SplashFrame {
  const impact = splashImpactAt(timing);
  const fade = fadeFrom === null ? 0 : clamp01((t - fadeFrom) / timing.fadeOutDuration);
  const fadeIn = 1 - clamp01(t / timing.backdropIn);
  const towerProgress = clamp01((t - timing.towerAt) / timing.towerDuration);
  const towerStep = Math.floor(towerProgress * timing.towerSteps) / timing.towerSteps;
  return {
    blackout: Math.max(fadeIn, fade),
    titleVisible: t >= timing.slamAt,
    titleScale: titleScaleAt(t, timing),
    flashAlpha: t < impact ? 0 : timing.flashAlpha * (1 - clamp01((t - impact) / timing.flashDuration)),
    glowAlpha: t < impact ? 0 : 1,
    towerAlpha: towerStep,
    towerOffsetY: timing.towerDropPx * (1 - towerStep),
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
