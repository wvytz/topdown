import { describe, expect, it } from 'vitest';
import { SPLASH_TIMING as T, SPLASH_TITLE_WORDS } from '@/config/splashConfig';
import { pixelText } from '@/core/pixelArt';
import { splashFadeStart, splashFrame, splashImpacts } from '@/systems/splashTimeline';

const frame = (t: number, fadeFrom: number | null = null) => splashFrame(t, fadeFrom);
const impacts = splashImpacts();
const [firstImpact, lastImpact] = [impacts[0]!, impacts[impacts.length - 1]!];

describe('splashFrame — sekwencja ekranu startowego', () => {
  it('nazwa gry TOP DOWN składa się z fontu pikselowego', () => {
    expect(SPLASH_TITLE_WORDS.join(' ')).toBe('TOP DOWN');
    expect(() => pixelText(SPLASH_TITLE_WORDS.join(' '), 1)).not.toThrow();
    expect(T.wordSlamAt).toHaveLength(SPLASH_TITLE_WORDS.length);
  });

  it('start z czerni; piorun na moment odsłania tło; potem tło wychodzi na stałe', () => {
    expect(frame(0).blackout).toBe(1);
    const strike = T.lightningAt[0];
    expect(frame(strike).lightning).toBeCloseTo(T.lightningPeak[0]);
    expect(frame(strike).blackout).toBeLessThan(0.2);
    expect(frame(strike + T.lightningDecay).blackout).toBe(1);
    expect(frame(T.backdropAt + T.backdropIn).blackout).toBe(0);
  });

  it('słowa uderzają po kolei, z dużej skali, z odbiciem do 1', () => {
    const [topAt, downAt] = [T.wordSlamAt[0], T.wordSlamAt[1]];
    expect(frame(topAt - 1).words.map((w) => w.visible)).toEqual([false, false]);
    expect(frame(topAt).words.map((w) => w.visible)).toEqual([true, false]);
    expect(frame(downAt).words.map((w) => w.visible)).toEqual([true, true]);
    expect(frame(topAt).words[0]!.scale).toBeCloseTo(T.slamFromScale);
    expect(frame(firstImpact).words[0]!.scale).toBeCloseTo(T.slamUndershoot);
    expect(frame(firstImpact + T.settleDuration / 2).words[0]!.scale).toBeCloseTo(T.slamOvershoot);
    expect(frame(lastImpact + T.settleDuration).words.every((w) => w.scale === 1)).toBe(true);
  });

  it('ostatnie uderzenie jest mocniejsze: błysk i wstrząs', () => {
    expect(frame(firstImpact - 1).flashAlpha).toBe(0);
    expect(frame(firstImpact).flashAlpha).toBeCloseTo(T.flashAlpha[0]);
    expect(frame(lastImpact).flashAlpha).toBeCloseTo(T.flashAlpha[1]);
    expect(T.flashAlpha[1]).toBeGreaterThan(T.flashAlpha[0]);
    expect(T.shakeIntensity[1]).toBeGreaterThan(T.shakeIntensity[0]);
    expect(frame(lastImpact + T.flashDuration).flashAlpha).toBe(0);
  });

  it('poświata rośnie z uderzeniami, promienie wychodzą po ostatnim', () => {
    expect(frame(firstImpact - 1).glowAlpha).toBe(0);
    expect(frame(firstImpact).glowAlpha).toBeGreaterThan(0);
    expect(frame(lastImpact).glowAlpha).toBe(1);
    expect(frame(lastImpact).raysAlpha).toBe(0);
    expect(frame(lastImpact + T.raysFadeIn).raysAlpha).toBe(1);
  });

  it('połysk przechodzi raz od lewej do prawej', () => {
    expect(frame(T.shineAt - 1).shine).toBeNull();
    expect(frame(T.shineAt).shine).toBe(0);
    expect(frame(T.shineAt + T.shineDuration / 2).shine).toBeCloseTo(0.5);
    expect(frame(T.shineAt + T.shineDuration + 1).shine).toBeNull();
    expect(T.shineAt).toBeGreaterThan(lastImpact + T.settleDuration);
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
    for (let t = 0; t < 4000; t += 13) {
      const n = frame(t).subtitleChars;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it('cała sekwencja mieści się przed wygaszeniem', () => {
    expect(lastImpact + T.settleDuration).toBeLessThan(T.fadeOutAt);
    expect(T.shineAt + T.shineDuration).toBeLessThan(T.fadeOutAt);
    expect(T.subtitleAt + 26 * T.subtitleCharMs).toBeLessThan(T.fadeOutAt);
  });

  it('wygaszenie do czerni kończy ekran', () => {
    const from = 3500;
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
    expect(splashFadeStart({ ...base, fadeFrom: 3400, skipRequested: true, t: 3600 })).toBe(3400);
  });
});
