import Phaser from 'phaser';
import { FONT_BOLD_GLYPHS, FONT_CELL_HEIGHT, FONT_GLYPHS, FONT_LETTER_GAP, FONT_LINE_HEIGHT, FONT_TOP_ROW } from '@/core/pixelFont';
import { UI_FONT_DEFAULT, UI_FONT_RAMP, UI_FONT_STYLES, UI_PALETTE, type UiFontStyle } from '@/config/uiConfig';

/** Odstęp między znakami w teksturze — żeby filtr tekstury nie złapał sąsiada. */
const ATLAS_PADDING = 1;
/** Obrys liter (piksele fontu) — wypalony w teksturze, w barwie obrysu postaci. */
const OUTLINE = 1;

/** Wariant liter z adresu (`?font=a|b|c`) albo domyślny. */
let chosenStyle: keyof typeof UI_FONT_STYLES | null = null;
export function uiFontVariant(): keyof typeof UI_FONT_STYLES {
  if (chosenStyle) return chosenStyle;
  let variant: string | null = null;
  try {
    variant = new URLSearchParams(window.location.search).get('font');
  } catch {
    variant = null;
  }
  chosenStyle = variant && variant in UI_FONT_STYLES ? (variant as keyof typeof UI_FONT_STYLES) : UI_FONT_DEFAULT;
  return chosenStyle;
}

export function uiFontStyle(): UiFontStyle {
  return UI_FONT_STYLES[uiFontVariant()];
}

/** Mieszanie barw: `t` = 0 → a, 1 → b. */
function mix(a: number, b: number, t: number): string {
  const ch = (s: number) => Math.round(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** Barwa CSS albo liczba → `rrggbb`. */
export function normalizeColor(color: string | number): string {
  if (typeof color === 'number') return color.toString(16).padStart(6, '0');
  const hex = color.replace('#', '').toLowerCase();
  if (hex.length === 3) return [...hex].map((c) => c + c).join('');
  return hex.slice(0, 6);
}

/**
 * Pogrubienie: piksel dostaje sąsiada z prawej (kreski 2 px), chyba że zalałby jednopikselowe światło litery
 * (w, m, ukośne kreski) — wtedy w tym wierszu kreska zostaje cienka, a litera otwarta.
 */
function emboldened(pixels: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  const set = new Set(pixels.map((p) => `${p.x},${p.y}`));
  const out = [...pixels];
  for (const { x, y } of pixels) {
    if (set.has(`${x + 1},${y}`) || set.has(`${x + 2},${y}`)) continue;
    out.push({ x: x + 1, y });
  }
  return out;
}

/** Czy napis tej wielkości dostaje gruby krój w bieżącym wariancie. */
export function isBoldSize(size: number): boolean {
  const from = uiFontStyle().boldFrom;
  return from !== null && size >= from;
}

/**
 * Pikselowy krój interfejsu jako font bitmapowy Phasera (krok U7). Każda barwa napisu to osobna mała tekstura
 * (ok. 900×14 px) — działa tak samo w WebGL i na płótnie (bez barwienia tintem), a obrys zostaje ciemny.
 * Tekstury i dane fontu są wspólne dla wszystkich scen; powstają przy pierwszym użyciu barwy.
 */
export function pixelFontKey(scene: Phaser.Scene, color: string | number, size = 1): string {
  const hex = normalizeColor(color);
  const style = uiFontStyle();
  const bold = isBoldSize(size);
  const key = `ui-font-${uiFontVariant()}-${bold ? 'b' : 'r'}-${hex}`;
  const cache = scene.sys.cache.bitmapFont;
  if (cache.exists(key)) return key;

  // Gruby krój: każdy piksel litery ma sąsiada z prawej (kreski 2 px), znak jest o 1 szerszy.
  const extra = bold ? 1 : 0;
  const shadow = style.shadow ? 1 : 0;
  const glyphs = [...FONT_GLYPHS.entries()].map(([char, glyph]) => {
    const own = bold ? FONT_BOLD_GLYPHS.get(char) : undefined;
    if (own) return [char, own] as const;
    const pixels = bold ? emboldened(glyph.pixels) : glyph.pixels;
    return [char, { width: glyph.width + extra, pixels }] as const;
  });
  const cellHeight = FONT_CELL_HEIGHT + OUTLINE * 2 + shadow;
  const width = glyphs.reduce((sum, [, glyph]) => sum + glyph.width + OUTLINE * 2 + shadow + ATLAS_PADDING, 0);
  const textures = scene.sys.textures;
  if (textures.exists(key)) textures.remove(key);
  const canvas = textures.createCanvas(key, width, cellHeight);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx) return key;

  const base = Number.parseInt(hex, 16);
  const R = UI_FONT_RAMP;
  const ink = `#${normalizeColor(UI_PALETTE.ink)}`;
  const fillFor = (row: number): string => {
    if (!style.ramp) return `#${hex}`;
    if (row <= R.lightRowsUntil) return mix(base, R.lightTone, R.light);
    if (row >= R.darkRowsFrom) return mix(base, 0x000000, R.dark);
    return `#${hex}`;
  };
  const chars: Record<number, unknown> = {};
  let left = 0;
  for (const [char, glyph] of glyphs) {
    const w = glyph.width + OUTLINE * 2 + shadow;
    // Cień: obrys przesunięty o piksel w dół i w prawo, w czerni ekranu startowego — litera „stoi” nad sceną.
    if (shadow) {
      ctx.fillStyle = `#${normalizeColor(R.shadowColor)}`;
      for (const { x, y } of glyph.pixels) ctx.fillRect(left + x + 1, y - FONT_TOP_ROW + 1, 3, 3);
    }
    // Obrys: każdy piksel litery rozlany na 8 sąsiadów, potem lico z rampą.
    ctx.fillStyle = ink;
    for (const { x, y } of glyph.pixels) ctx.fillRect(left + x, y - FONT_TOP_ROW, 3, 3);
    for (const { x, y } of glyph.pixels) {
      ctx.fillStyle = fillFor(y);
      ctx.fillRect(left + x + OUTLINE, y - FONT_TOP_ROW + OUTLINE, 1, 1);
    }
    const code = char.codePointAt(0) ?? 63;
    chars[code] = {
      x: left,
      y: 0,
      width: w,
      height: cellHeight,
      centerX: Math.floor(w / 2),
      centerY: Math.floor(cellHeight / 2),
      xOffset: -OUTLINE,
      yOffset: 0,
      xAdvance: glyph.width + FONT_LETTER_GAP,
      data: {},
      kerning: {},
      u0: left / width,
      v0: 0,
      u1: (left + w) / width,
      v1: 1,
    };
    left += w + ATLAS_PADDING;
  }
  canvas.refresh();
  cache.add(key, {
    data: { font: key, size: 1, lineHeight: FONT_LINE_HEIGHT, chars },
    texture: key,
    frame: null,
  });
  return key;
}
