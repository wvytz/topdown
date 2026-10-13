import { describe, expect, it } from 'vitest';
import { LIGHTING } from '@/config/lightingConfig';
import {
  ambientDarkness,
  banded,
  buildLightStamp,
  darknessModifierProfile,
  flickerRadius,
  lightTouchesView,
  pixelEllipse,
  playerLightStrength,
  pointLightStrength,
} from '@/systems/lighting';

const AMBIENT = LIGHTING.ambient;

describe('banded — twarde pasma', () => {
  it('zaokrągla w górę do stopni 1/bands; 0 zostaje 0, 1 zostaje 1', () => {
    expect(banded(0, 3)).toBe(0);
    expect(banded(0.01, 3)).toBeCloseTo(1 / 3);
    expect(banded(1 / 3, 3)).toBeCloseTo(1 / 3);
    expect(banded(0.5, 3)).toBeCloseTo(2 / 3);
    expect(banded(1, 3)).toBe(1);
    expect(banded(7, 3)).toBe(1);
  });
});

describe('ambientDarkness — mrok wokół gracza', () => {
  const samples = Array.from({ length: 400 }, (_, i) => i);

  it('pełne światło do promienia gracza, potem nie maleje i nie przekracza limitu 30%', () => {
    let previous = 0;
    for (const d of samples) {
      const dark = ambientDarkness(d, AMBIENT);
      if (d <= AMBIENT.fullLightRadius) expect(dark).toBe(0);
      expect(dark).toBeGreaterThanOrEqual(previous);
      expect(dark).toBeLessThanOrEqual(AMBIENT.maxDarkness);
      previous = dark;
    }
    expect(ambientDarkness(AMBIENT.edgeRadius, AMBIENT)).toBeCloseTo(AMBIENT.maxDarkness);
  });

  it('dokładnie tyle twardych pasm, ile w konfiguracji (bez gradientu)', () => {
    const levels = new Set(samples.map((d) => ambientDarkness(d, AMBIENT).toFixed(6)));
    expect(levels.size).toBe(AMBIENT.bands + 1); // pasma + pełne światło
  });

  it('siła światła gracza odwraca mrok: maxDarkness × (1 − siła) = mrok', () => {
    for (const d of samples) {
      expect(AMBIENT.maxDarkness * (1 - playerLightStrength(d, AMBIENT))).toBeCloseTo(ambientDarkness(d, AMBIENT));
    }
  });

  it('profil „Mroku”: pełne światło do (1 − softEdge) promienia, pełny mrok od promienia', () => {
    const profile = darknessModifierProfile(112, LIGHTING.darknessModifier);
    expect(ambientDarkness(112 * (1 - LIGHTING.darknessModifier.softEdge), profile)).toBe(0);
    expect(ambientDarkness(112, profile)).toBeCloseTo(LIGHTING.darknessModifier.maxDarkness);
    expect(ambientDarkness(500, profile)).toBeCloseTo(LIGHTING.darknessModifier.maxDarkness);
  });
});

describe('światło punktowe i stemple', () => {
  it('pochodnia: 1 w środku, pasma, 0 od promienia', () => {
    const { radius, bands } = LIGHTING.torch;
    expect(pointLightStrength(0, radius, bands)).toBe(1);
    expect(pointLightStrength(radius, radius, bands)).toBe(0);
    expect(pointLightStrength(radius + 5, radius, bands)).toBe(0);
    const levels = new Set(Array.from({ length: radius }, (_, d) => pointLightStrength(d, radius, bands).toFixed(6)));
    expect(levels.size).toBe(bands);
  });

  it('stempel: kwadrat 2r, środek w pełni kryjący, rogi puste, tylko poziomy pasm', () => {
    const stamp = buildLightStamp(72, (d) => pointLightStrength(d, 72, 3));
    expect(stamp.size).toBe(144);
    expect(stamp.alpha[72 * 144 + 72]).toBe(255);
    expect(stamp.alpha[0]).toBe(0);
    expect(new Set(stamp.alpha)).toEqual(new Set([0, 85, 170, 255]));
  });

  it('migotanie: promień skacze tylko o wartości z konfiguracji', () => {
    const { radius, flickerOffsets } = LIGHTING.torch;
    const allowed = new Set(flickerOffsets.map((o) => radius + o));
    for (const roll of [0, 0.2, 0.49, 0.5, 0.75, 0.999]) expect(allowed.has(flickerRadius(radius, flickerOffsets, roll))).toBe(true);
    expect(flickerRadius(radius, flickerOffsets, 0)).toBe(radius + flickerOffsets[0]!);
    expect(flickerRadius(radius, [], 0.7)).toBe(radius);
  });

  it('pomijanie świateł poza kadrem', () => {
    const view = { x: 100, y: 100, width: 480, height: 270 };
    expect(lightTouchesView({ x: 300, y: 200 }, 72, view)).toBe(true);
    expect(lightTouchesView({ x: 50, y: 200 }, 72, view)).toBe(true); // poza kadrem, ale światło sięga
    expect(lightTouchesView({ x: 20, y: 200 }, 72, view)).toBe(false);
    expect(lightTouchesView({ x: 300, y: 450 }, 72, view)).toBe(false);
  });
});

describe('pixelEllipse — cień pod postacią', () => {
  it('symetryczna, wypełniony środek, puste rogi', () => {
    const w = 22;
    const h = 12;
    const mask = pixelEllipse(w, h);
    expect(mask[Math.floor(h / 2) * w + Math.floor(w / 2)]).toBe(1);
    expect(mask[0]).toBe(0);
    expect(mask[w - 1]).toBe(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) expect(mask[y * w + x]).toBe(mask[y * w + (w - 1 - x)]);
    }
  });
});
