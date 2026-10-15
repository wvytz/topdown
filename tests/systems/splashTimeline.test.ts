import { describe, expect, it } from 'vitest';
import { SPLASH_LAYOUT, SPLASH_TIMING as T, SPLASH_TITLE_LINES } from '@/config/splashConfig';
import { pixelText } from '@/core/pixelArt';
import { splashFadeStart, splashFrame, splashImpacts } from '@/systems/splashTimeline';

const frame = (t: number, fadeFrom: number | null = null) => splashFrame(t, fadeFrom);
const impacts = splashImpacts();
const [firstImpact, lastImpact] = [impacts[0]!, impacts[impacts.length - 1]!];

describe('napis TOP DOWN w dwóch liniach', () => {
  it('TOP na górze, DOWN na dole, obie linie z fontu pikselowego', () => {
    expect(SPLASH_TITLE_LINES.map((l) => l.text)).toEqual(['TOP', 'DOWN']);
    const [top, down] = SPLASH_TITLE_LINES;
    expect(top.centerY).toBeLessThan(down.centerY);
    for (const line of SPLASH_TITLE_LINES) expect(() => pixelText(line.text, 1)).not.toThrow();
    expect(T.wordSlamAt).toHaveLength(SPLASH_TITLE_LINES.length);
  });

  it('linie mieszczą się na ekranie i nie zachodzą na siebie (z wytłoczeniem)', () => {
    const { unit, extrude } = SPLASH_LAYOUT.title;
    const half = (7 * unit) / 2;
    const [top, down] = SPLASH_TITLE_LINES;
    expect(top.centerY - half - extrude).toBeGreaterThanOrEqual(0);
    expect(down.centerY + half + 6 * extrude).toBeLessThanOrEqual(540);
    expect(top.centerY + half + 6 * extrude).toBeLessThan(down.centerY - half);
    for (const line of SPLASH_TITLE_LINES) expect(pixelText(line.text, 1).width * unit).toBeLessThan(960);
  });
});

describe('splashFrame — sekwencja ekranu startowego', () => {
  it('wieża wyłania się powoli z ciemności', () => {
    expect(frame(0).blackout).toBe(1);
    expect(frame(T.revealAt).blackout).toBe(1);
    const mid = frame(T.revealAt + T.revealDuration / 2).blackout;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(frame(T.revealAt + T.revealDuration).blackout).toBe(0);
  });

  it('korona zaćmienia rozżarza się, zanim spadnie napis', () => {
    expect(frame(T.coronaAt).coronaAlpha).toBe(0);
    expect(frame(T.wordSlamAt[0]).coronaAlpha).toBeGreaterThan(0.3);
    expect(frame(T.coronaAt + T.coronaDuration).coronaAlpha).toBe(1);
  });

  it('TOP, potem DOWN — każde z dużej skali z odbiciem do 1', () => {
    const [topAt, downAt] = [T.wordSlamAt[0], T.wordSlamAt[1]];
    expect(frame(topAt - 1).words.map((w) => w.visible)).toEqual([false, false]);
    expect(frame(topAt).words.map((w) => w.visible)).toEqual([true, false]);
    expect(frame(downAt).words.map((w) => w.visible)).toEqual([true, true]);
    expect(frame(topAt).words[0]!.scale).toBeCloseTo(T.slamFromScale);
    expect(frame(firstImpact).words[0]!.scale).toBeCloseTo(T.slamUndershoot);
    expect(frame(firstImpact + T.settleDuration / 2).words[0]!.scale).toBeCloseTo(T.slamOvershoot);
    expect(frame(lastImpact + T.settleDuration).words.every((w) => w.scale === 1)).toBe(true);
  });

  it('DOWN uderza ciężej: mocniejszy błysk i wstrząs', () => {
    expect(frame(firstImpact - 1).flashAlpha).toBe(0);
    expect(frame(firstImpact).flashAlpha).toBeCloseTo(T.flashAlpha[0]);
    expect(frame(lastImpact).flashAlpha).toBeCloseTo(T.flashAlpha[1]);
    expect(T.flashAlpha[1]).toBeGreaterThan(T.flashAlpha[0]);
    expect(T.shakeIntensity[1]).toBeGreaterThan(T.shakeIntensity[0]);
    expect(frame(lastImpact + T.flashDuration).flashAlpha).toBe(0);
  });

  it('pęknięcia w ziemi żarzą się dopiero po uderzeniu DOWN', () => {
    expect(frame(lastImpact - 1).cracksAlpha).toBe(0);
    expect(frame(lastImpact + T.cracksDuration).cracksAlpha).toBe(1);
  });

  it('oczy w mroku zapalają się po kolei i mrugają', () => {
    expect(frame(T.eyesAt - 1).eyesOn).toBe(false);
    expect(frame(T.eyesAt).eyesOn).toBe(true);
    expect(frame(T.eyesAt).lateEyesOn).toBe(false);
    expect(frame(T.eyesAt + T.lateEyesDelay).lateEyesOn).toBe(true);
    expect(frame(T.eyesAt + T.blinkOffset).eyesOn).toBe(false);
    expect(frame(T.eyesAt + T.blinkOffset + T.blinkLength).eyesOn).toBe(true);
  });

  it('cała sekwencja mieści się przed wygaszeniem', () => {
    expect(lastImpact + T.settleDuration).toBeLessThan(T.fadeOutAt);
    expect(T.eyesAt + T.lateEyesDelay).toBeLessThan(T.fadeOutAt);
    expect(lastImpact + T.cracksDuration).toBeLessThan(T.fadeOutAt);
  });

  it('wygaszenie do czerni kończy ekran', () => {
    const from = 3800;
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
    expect(splashFadeStart({ ...base, fadeFrom: 3700, skipRequested: true, t: 3900 })).toBe(3700);
  });
});
