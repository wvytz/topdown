import type { Rgba, RgbaImage } from './png';
import { contrastRatio, hueSaturation, luminance, pixel } from './png';

/** Progi czytelności ze STYLEGUIDE §6a (kontrast WCAG względem średniej jasności podłogi). */
export const READABILITY = { outlineMin: 2.0, bodyMin: 1.5, hueDeltaMin: 60, bodySaturationMin: 0.25 };

export const hex = ([r, g, b]: Rgba): string => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

export function mostCommon(pixels: readonly Rgba[]): Rgba {
  const counts = new Map<string, { color: Rgba; n: number }>();
  for (const p of pixels) {
    const entry = counts.get(hex(p)) ?? { color: p, n: 0 };
    entry.n++;
    counts.set(hex(p), entry);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  if (!best) throw new Error('mostCommon: brak pikseli');
  return best.color;
}

export interface FloorReference {
  readonly luminance: number;
  readonly hue: number;
}

/** Średnia jasność pikseli podłogi i barwa jej najczęstszego koloru. */
export function floorReference(pixels: readonly Rgba[]): FloorReference {
  const mean = pixels.reduce((sum, p) => sum + luminance(p), 0) / pixels.length;
  return { luminance: mean, hue: hueSaturation(mostCommon(pixels)).hue };
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Obrys = najczęstszy kolor na krawędzi sylwetki (piksel kryjący z przezroczystym sąsiadem
 * albo na brzegu klatki), ciało = najczęstszy pozostały kolor kryjący (bez prawie czarnych akcentów).
 */
export function spriteColors(img: RgbaImage, rect: Rect): { outline: Rgba; body: Rgba } {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < rect.w && y < rect.h;
  const at = (x: number, y: number) => pixel(img, rect.x + x, rect.y + y);
  const edge: Rgba[] = [];
  const inner: Rgba[] = [];
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const p = at(x, y);
      if (p[3] !== 255) continue;
      const onEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx!;
        const ny = y + dy!;
        return !inside(nx, ny) || at(nx, ny)[3] === 0;
      });
      (onEdge ? edge : inner).push(p);
    }
  }
  const outline = mostCommon(edge);
  return { outline, body: mostCommon(inner.filter((p) => hex(p) !== hex(outline) && luminance(p) > 0.006)) };
}

export interface Readability {
  readonly outline: number;
  readonly body: number;
  readonly hueDelta: number;
  readonly bodySaturation: number;
  readonly passes: boolean;
}

/** Obrys ≥ 2:1 oraz ciało ≥ 1,5:1 albo różnica barwy ≥ 60° przy nasyceniu ciała ≥ 25%. */
export function evaluateReadability(colors: { outline: Rgba; body: Rgba }, floor: FloorReference): Readability {
  const { hue, saturation } = hueSaturation(colors.body);
  const rawDelta = Math.abs(hue - floor.hue);
  const result = {
    outline: contrastRatio(luminance(colors.outline), floor.luminance),
    body: contrastRatio(luminance(colors.body), floor.luminance),
    hueDelta: Math.min(rawDelta, 360 - rawDelta),
    bodySaturation: saturation,
  };
  const bodyReadable =
    result.body >= READABILITY.bodyMin ||
    (result.hueDelta >= READABILITY.hueDeltaMin && result.bodySaturation >= READABILITY.bodySaturationMin);
  return { ...result, passes: result.outline >= READABILITY.outlineMin && bodyReadable };
}
