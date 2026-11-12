import Phaser from 'phaser';
import { FONT_CELL_HEIGHT, FONT_GLYPHS, FONT_LETTER_GAP, FONT_LINE_HEIGHT, FONT_TOP_ROW } from '@/core/pixelFont';
import { UI_PALETTE } from '@/config/uiConfig';

/** Odstęp między znakami w teksturze — żeby filtr tekstury nie złapał sąsiada. */
const ATLAS_PADDING = 1;
/** Obrys liter (piksele fontu) — wypalony w teksturze, w barwie obrysu postaci. */
const OUTLINE = 1;

/** Barwa CSS albo liczba → `rrggbb`. */
export function normalizeColor(color: string | number): string {
  if (typeof color === 'number') return color.toString(16).padStart(6, '0');
  const hex = color.replace('#', '').toLowerCase();
  if (hex.length === 3) return [...hex].map((c) => c + c).join('');
  return hex.slice(0, 6);
}

/**
 * Pikselowy krój interfejsu jako font bitmapowy Phasera (krok U7). Każda barwa napisu to osobna mała tekstura
 * (ok. 900×14 px) — działa tak samo w WebGL i na płótnie (bez barwienia tintem), a obrys zostaje ciemny.
 * Tekstury i dane fontu są wspólne dla wszystkich scen; powstają przy pierwszym użyciu barwy.
 */
export function pixelFontKey(scene: Phaser.Scene, color: string | number): string {
  const hex = normalizeColor(color);
  const key = `ui-font-${hex}`;
  const cache = scene.sys.cache.bitmapFont;
  if (cache.exists(key)) return key;

  const glyphs = [...FONT_GLYPHS.entries()];
  const cellHeight = FONT_CELL_HEIGHT + OUTLINE * 2;
  const width = glyphs.reduce((sum, [, glyph]) => sum + glyph.width + OUTLINE * 2 + ATLAS_PADDING, 0);
  const textures = scene.sys.textures;
  if (textures.exists(key)) textures.remove(key);
  const canvas = textures.createCanvas(key, width, cellHeight);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx) return key;

  const ink = `#${normalizeColor(UI_PALETTE.ink)}`;
  const chars: Record<number, unknown> = {};
  let left = 0;
  for (const [char, glyph] of glyphs) {
    const w = glyph.width + OUTLINE * 2;
    // Obrys: każdy piksel litery rozlany na 8 sąsiadów, potem lico.
    ctx.fillStyle = ink;
    for (const { x, y } of glyph.pixels) ctx.fillRect(left + x, y - FONT_TOP_ROW, 3, 3);
    ctx.fillStyle = `#${hex}`;
    for (const { x, y } of glyph.pixels) ctx.fillRect(left + x + OUTLINE, y - FONT_TOP_ROW + OUTLINE, 1, 1);
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
