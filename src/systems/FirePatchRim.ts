import type { OutlineCircle } from '@/systems/AreaOutline';

/**
 * Obrys płonących plam z pojedynczych pikseli (krok 176) zamiast gładkiej kreski: pas żarzących się węgli
 * w samym brzegu zasięgu, ciemna skorupa tuż za nim i rozproszona poświata w głąb plamy. Liczone dla sumy kół —
 * smuga nachodzących plam ma jeden obrys, a każdy piksel należy do jednej plamy (bez podwójnego ADD).
 */

/** Rodzaj piksela obrysu: skorupa (za brzegiem), żar (zewnętrzny i wewnętrzny piksel pasa), poświata. */
export enum RimPixelKind {
  Crust = 0,
  EmberOuter = 1,
  EmberInner = 2,
  Glow = 3,
}

export interface RimPixel {
  /** Lewy górny róg piksela świata. */
  readonly x: number;
  readonly y: number;
  readonly kind: RimPixelKind;
}

export interface RimShape {
  /** Grubość skorupy za brzegiem (px). */
  readonly crust: number;
  /** Grubość pasa żaru w brzegu (px; pierwsza połowa to `EmberOuter`). */
  readonly ember: number;
  /** Głębokość rozproszonej poświaty za pasem żaru (px). */
  readonly glow: number;
}

/** Macierz Bayera 4×4 (STYLEGUIDE §5: rozproszenie tylko dla substancji amorficznych — tu poświata żaru). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** Próg Bayera piksela (0..1). */
export function bayerThreshold(x: number, y: number): number {
  return (BAYER[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)]! + 0.5) / 16;
}

/**
 * Głębokość punktu w sumie kół: dodatnia w środku (odległość od najbliższego brzegu sumy, przybliżenie
 * największym `r - d`), ujemna na zewnątrz.
 */
function depthIn(px: number, py: number, circles: readonly OutlineCircle[]): number {
  let depth = -Infinity;
  for (const c of circles) depth = Math.max(depth, c.radius - Math.hypot(px - c.center.x, py - c.center.y));
  return depth;
}

/**
 * Piksele obrysu koła `circles[index]` (współrzędne całkowite). Piksel liczymy po jego środku: żar leży
 * w kole (`d < r`), więc rysunek nie wychodzi poza zasięg parzenia; skorupa — tuż za nim. Piksel należący
 * do kilku kół dostaje koło o najniższym indeksie, które go obejmuje (z zapasem skorupy).
 */
export function rimPixels(circles: readonly OutlineCircle[], index: number, shape: RimShape): RimPixel[] {
  const me = circles[index]!;
  const reach = me.radius + shape.crust;
  const near = circles.filter((c) => Math.hypot(c.center.x - me.center.x, c.center.y - me.center.y) < c.radius + reach + shape.crust);
  const earlier = circles.slice(0, index).filter((c) => near.includes(c));
  const inner = shape.ember + shape.glow;
  const out: RimPixel[] = [];
  const x0 = Math.floor(me.center.x - reach);
  const y0 = Math.floor(me.center.y - reach);
  const x1 = Math.ceil(me.center.x + reach);
  const y1 = Math.ceil(me.center.y + reach);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const own = me.radius - Math.hypot(cx - me.center.x, cy - me.center.y);
      if (own < -shape.crust || own >= inner) continue;
      // Piksel wcześniejszej plamy (z jej skorupą) rysuje tamta plama.
      if (earlier.some((c) => c.radius - Math.hypot(cx - c.center.x, cy - c.center.y) >= -shape.crust)) continue;
      const depth = depthIn(cx, cy, near);
      if (depth < -shape.crust || depth >= inner) continue;
      if (depth < 0) out.push({ x, y, kind: RimPixelKind.Crust });
      else if (depth < shape.ember / 2) out.push({ x, y, kind: RimPixelKind.EmberOuter });
      else if (depth < shape.ember) out.push({ x, y, kind: RimPixelKind.EmberInner });
      // Poświata rzednie w głąb (Bayer): przy pasie żaru gęsta, na końcu pojedyncze piksele.
      else if (1 - (depth - shape.ember) / Math.max(1, shape.glow) > bayerThreshold(x, y)) out.push({ x, y, kind: RimPixelKind.Glow });
    }
  }
  return out;
}
