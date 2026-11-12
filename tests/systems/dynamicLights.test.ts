import { describe, expect, it } from 'vitest';
import { RenderQuality } from '@/core/displayTypes';
import { LightKind } from '@/core/lightTypes';
import type { LightSource } from '@/core/lightTypes';
import { DYNAMIC_LIGHT_CONFIG, DYNAMIC_LIGHT_LEVELS } from '@/config/dynamicLightConfig';
import { renderProfile } from '@/systems/RenderQuality';
import {
  beamLightPoints,
  blackSunAlpha,
  blackSunFalloff,
  dynamicLightLevel,
  flashPeakRadius,
  flashRadius,
  inViewWithMargin,
  isLightOff,
  quantizeRadius,
  selectLights,
} from '@/systems/DynamicLights';

const VIEW = { x: 0, y: 0, width: 400, height: 300 };
const light = (x: number, y: number, radius: number, kind: LightKind): LightSource => ({ x, y, radius, kind });

describe('światło 2.0 (krok U3)', () => {
  it('Niska = gra sprzed upgradu: żadnego światła dynamicznego, także przy „mniej błysków”', () => {
    expect(isLightOff(dynamicLightLevel(renderProfile(RenderQuality.Low, false)))).toBe(true);
    expect(isLightOff(dynamicLightLevel(renderProfile(RenderQuality.Low, true)))).toBe(true);
  });

  it('wyższy poziom nie ma mniej świateł niż niższy; barwa dopiero na Wysokiej', () => {
    const order = [RenderQuality.Low, RenderQuality.Medium, RenderQuality.High];
    for (let i = 1; i < order.length; i++) {
      const lo = DYNAMIC_LIGHT_LEVELS[order[i - 1]!];
      const hi = DYNAMIC_LIGHT_LEVELS[order[i]!];
      expect(hi.maxLights).toBeGreaterThanOrEqual(lo.maxLights);
      for (const key of ['shots', 'flashes', 'beam', 'tint'] as const) if (lo[key]) expect(hi[key]).toBe(true);
    }
    expect(DYNAMIC_LIGHT_LEVELS[RenderQuality.Medium].tint).toBe(false);
    expect(DYNAMIC_LIGHT_LEVELS[RenderQuality.High].tint).toBe(true);
  });

  it('„mniej błysków” gasi błyski wybuchów, ale pociski świecą dalej', () => {
    const level = dynamicLightLevel(renderProfile(RenderQuality.High, true));
    expect(level.flashes).toBe(false);
    expect(level.shots).toBe(true);
  });

  it('promień zaokrąglany w dół do kroku, ujemny i NaN — 0', () => {
    const step = DYNAMIC_LIGHT_CONFIG.radiusStep;
    expect(quantizeRadius(step * 3 + 1)).toBe(step * 3);
    expect(quantizeRadius(-5)).toBe(0);
    expect(quantizeRadius(Number.NaN)).toBe(0);
  });

  it('szczyt błysku rośnie ze strefą, ale w granicach', () => {
    const { minRadius, maxRadius } = DYNAMIC_LIGHT_CONFIG.flash;
    expect(flashPeakRadius(1)).toBeGreaterThanOrEqual(quantizeRadius(minRadius));
    expect(flashPeakRadius(10_000)).toBeLessThanOrEqual(maxRadius);
    expect(flashPeakRadius(60)).toBeGreaterThan(flashPeakRadius(20));
  });

  it('błysk gaśnie monotonicznie i skokowo, a po czasie znika', () => {
    const peak = 96;
    const duration = DYNAMIC_LIGHT_CONFIG.flash.durationMs;
    let prev = Infinity;
    for (let t = 0; t < duration; t += 10) {
      const r = flashRadius(peak, t);
      expect(r).toBeLessThanOrEqual(prev);
      expect(r % DYNAMIC_LIGHT_CONFIG.radiusStep).toBe(0);
      prev = r;
    }
    expect(flashRadius(peak, 0)).toBe(peak);
    expect(flashRadius(peak, duration)).toBe(0);
    expect(flashRadius(peak, -1)).toBe(0);
  });

  it('światła promienia: od kryształu do końca, w limicie', () => {
    const pts = beamLightPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 32, 7);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 0 });
    expect(pts.length).toBe(5);
    expect(beamLightPoints({ x: 0, y: 0 }, { x: 1000, y: 0 }, 32, 7)).toHaveLength(7);
    expect(beamLightPoints({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual([{ x: 5, y: 5 }]);
    expect(beamLightPoints({ x: 0, y: 0 }, { x: 9, y: 0 }, 32, 0)).toEqual([]);
  });

  it('wybór do kadru: poza kadrem i zgasłe odpadają, pociski wrogów pierwsze, limit', () => {
    const sources = [
      light(50, 50, 26, LightKind.Shot),
      light(900, 50, 26, LightKind.EnemyShot),
      light(60, 60, 0, LightKind.Blast),
      light(70, 70, 26, LightKind.EnemyShot),
      light(80, 80, 60, LightKind.Blast),
    ];
    const picked = selectLights(sources, VIEW, 10);
    expect(picked.map((s) => s.kind)).toEqual([LightKind.EnemyShot, LightKind.Shot, LightKind.Blast]);
    expect(selectLights(sources, VIEW, 1)).toEqual([sources[3]]);
    expect(selectLights(sources, VIEW, 0)).toEqual([]);
  });

  it('światło tuż za brzegiem kadru, ale sięgające do niego, się liczy', () => {
    expect(selectLights([light(-20, 100, 26, LightKind.Shot)], VIEW, 5)).toHaveLength(1);
    expect(selectLights([light(-30, 100, 26, LightKind.Shot)], VIEW, 5)).toHaveLength(0);
  });

  it('poświata gaśnie poza kadrem z zapasem', () => {
    const m = DYNAMIC_LIGHT_CONFIG.glowCullMargin;
    expect(inViewWithMargin({ x: 200, y: 150 }, 8, VIEW)).toBe(true);
    expect(inViewWithMargin({ x: -m - 7, y: 150 }, 8, VIEW)).toBe(true);
    expect(inViewWithMargin({ x: -m - 9, y: 150 }, 8, VIEW)).toBe(false);
  });

  it('Czarne Słońce: mocniejsze im wyżej, w granicy, ten sam rytm w kolejnym kręgu', () => {
    const { maxAlpha, floorsPerLoop } = DYNAMIC_LIGHT_CONFIG.blackSun;
    for (let f = 2; f <= floorsPerLoop; f++) expect(blackSunAlpha(f)).toBeGreaterThan(blackSunAlpha(f - 1));
    expect(blackSunAlpha(floorsPerLoop)).toBeLessThanOrEqual(maxAlpha);
    expect(blackSunAlpha(floorsPerLoop + 1)).toBe(blackSunAlpha(1));
    expect(blackSunAlpha(0)).toBe(blackSunAlpha(1));
  });

  it('Czarne Słońce świeci z prawego górnego narożnika i gaśnie płynnie', () => {
    expect(blackSunFalloff(1, 0)).toBe(1);
    expect(blackSunFalloff(0, 1)).toBe(0);
    expect(blackSunFalloff(0.8, 0.2)).toBeGreaterThan(blackSunFalloff(0.5, 0.5));
    // Bez twardej krawędzi: przy brzegu zasięgu prawie zero.
    const reach = DYNAMIC_LIGHT_CONFIG.blackSun.reach;
    // Na przekątnej (1 − a, a) odległość od narożnika to dokładnie a przekątnej.
    const a = reach * 0.99;
    expect(blackSunFalloff(1 - a, a)).toBeLessThan(0.01);
    expect(blackSunFalloff(1 - reach, reach)).toBe(0);
  });
});
