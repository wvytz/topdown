import { describe, expect, it } from 'vitest';
import { SPLASH_TIMING as T } from '@/config/splashConfig';
import { splashFadeStart, splashFrame, splashImpactAt } from '@/systems/splashTimeline';

const frame = (t: number, fadeFrom: number | null = null) => splashFrame(t, fadeFrom);
const impact = splashImpactAt();

describe('splashFrame — sekwencja ekranu startowego', () => {
  it('start z czerni, tło wychodzi po backdropIn', () => {
    expect(frame(0).blackout).toBe(1);
    expect(frame(T.backdropIn).blackout).toBe(0);
    expect(frame(0).titleVisible).toBe(false);
  });

  it('CRAWLER uderza z dużej skali, odbija się i staje w skali 1', () => {
    expect(frame(T.slamAt).titleVisible).toBe(true);
    expect(frame(T.slamAt).titleScale).toBeCloseTo(T.slamFromScale);
    expect(frame(impact).titleScale).toBeCloseTo(T.slamUndershoot);
    expect(frame(impact + T.settleDuration / 2).titleScale).toBeCloseTo(T.slamOvershoot);
    expect(frame(impact + T.settleDuration).titleScale).toBe(1);
    expect(frame(2000).titleScale).toBe(1);
  });

  it('błysk i poświata dopiero od uderzenia; błysk gaśnie', () => {
    expect(frame(impact - 1).flashAlpha).toBe(0);
    expect(frame(impact - 1).glowAlpha).toBe(0);
    expect(frame(impact).flashAlpha).toBeCloseTo(T.flashAlpha);
    expect(frame(impact + T.flashDuration).flashAlpha).toBe(0);
    expect(frame(impact).glowAlpha).toBe(1);
  });

  it('TOWER opada skokami (pikselowo), nie płynnie', () => {
    const allowed = Array.from({ length: T.towerSteps + 1 }, (_, i) => i / T.towerSteps);
    for (let t = T.towerAt - 50; t <= T.towerAt + T.towerDuration + 50; t += 7) {
      const f = frame(t);
      expect(allowed).toContain(f.towerAlpha);
      expect(f.towerOffsetY).toBeCloseTo(T.towerDropPx * (1 - f.towerAlpha));
    }
    expect(frame(T.towerAt + T.towerDuration).towerOffsetY).toBe(0);
  });

  it('oczy zapalają się po kolei i mrugają', () => {
    expect(frame(T.eyesAt - 1).eyesOn).toBe(false);
    expect(frame(T.eyesAt).eyesOn).toBe(true);
    expect(frame(T.eyesAt).lateEyesOn).toBe(false);
    expect(frame(T.eyesAt + T.lateEyesDelay).lateEyesOn).toBe(true);
    expect(frame(T.eyesAt + T.blinkOffset).eyesOn).toBe(false);
    expect(frame(T.eyesAt + T.blinkOffset + T.blinkLength).eyesOn).toBe(true);
  });

  it('podtytuł wpisuje się znak po znaku', () => {
    expect(frame(T.subtitleAt - 1).subtitleChars).toBe(0);
    expect(frame(T.subtitleAt + T.subtitleCharMs * 5).subtitleChars).toBe(5);
    let prev = 0;
    for (let t = 0; t < 3000; t += 13) {
      const n = frame(t).subtitleChars;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it('cała sekwencja mieści się przed wygaszeniem', () => {
    expect(impact + T.settleDuration).toBeLessThan(T.fadeOutAt);
    expect(T.towerAt + T.towerDuration).toBeLessThan(T.fadeOutAt);
    expect(T.subtitleAt + 26 * T.subtitleCharMs).toBeLessThan(T.fadeOutAt);
  });

  it('wygaszenie do czerni kończy ekran', () => {
    const from = 2500;
    expect(frame(from, from).blackout).toBe(0);
    expect(frame(from + T.fadeOutDuration / 2, from).blackout).toBeCloseTo(0.5);
    expect(frame(from + T.fadeOutDuration - 1, from).done).toBe(false);
    expect(frame(from + T.fadeOutDuration, from).done).toBe(true);
    expect(frame(from + T.fadeOutDuration, from).blackout).toBe(1);
    expect(frame(10_000, null).done).toBe(false);
  });
});

describe('splashFadeStart — kiedy przejść do gry', () => {
  const base = { fadeFrom: null, bootReady: true, skipRequested: false };

  it('gra gotowa: wygaszenie w zaplanowanej chwili, nie wcześniej', () => {
    expect(splashFadeStart({ ...base, t: T.fadeOutAt - 1 })).toBeNull();
    expect(splashFadeStart({ ...base, t: T.fadeOutAt })).toBe(T.fadeOutAt);
  });

  it('gra jeszcze się ładuje: tytuł trzyma się dłużej', () => {
    expect(splashFadeStart({ ...base, bootReady: false, t: 9000 })).toBeNull();
    expect(splashFadeStart({ ...base, bootReady: false, skipRequested: true, t: 9000 })).toBeNull();
  });

  it('pominięcie (klawisz, klik) zaczyna wygaszenie od razu', () => {
    expect(splashFadeStart({ ...base, skipRequested: true, t: 150 })).toBe(150);
  });

  it('raz ustalona chwila się nie zmienia', () => {
    expect(splashFadeStart({ ...base, fadeFrom: 2400, skipRequested: true, t: 2600 })).toBe(2400);
  });
});
