import Phaser from 'phaser';
import { FONT_CELL_HEIGHT, FONT_GLYPHS, FONT_LINE_HEIGHT, FONT_TOP_ROW, fontLook, rampIndex } from '@/core/pixelFont';
import { UI_FONT_LOOK } from '@/config/uiConfig';

/** Odstęp między znakami w teksturze — żeby filtr tekstury nie złapał sąsiada. */
const ATLAS_PADDING = 2;
/** Obrys liter: czerń ekranu startowego, jak pod napisem POLEGŁEŚ. */
const INK = '#07060b';

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
 * Pikselowy krój interfejsu jako font bitmapowy Phasera (krok U7, wygląd z kroku U7b). Każda para
 * barwa × wielkość to osobna mała tekstura narysowana od razu w docelowej skali — dzięki temu obrys jest
 * cieńszy od kreski litery, jak w napisie POLEGŁEŚ: cień w ciemnym odcieniu barwy (przesunięty w dół),
 * obrys krzyżem w czerni i lico w paskach rampy. Tekstury są wspólne dla scen; powstają przy pierwszym użyciu.
 */
export function pixelFontKey(scene: Phaser.Scene, color: string | number, size = 1): string {
  const hex = normalizeColor(color);
  const look = fontLook(size, UI_FONT_LOOK);
  const key = `ui-font-${look.px}-${hex}`;
  const cache = scene.sys.cache.bitmapFont;
  if (cache.exists(key)) return key;

  const { px, outline: o, shadow } = look;
  const glyphs = [...FONT_GLYPHS.entries()];
  const cellHeight = FONT_CELL_HEIGHT * px + o * 2 + shadow;
  const cellWidth = (width: number): number => width * px + o * 2;
  const atlasWidth = glyphs.reduce((sum, [, glyph]) => sum + cellWidth(glyph.width) + ATLAS_PADDING, 0);
  const textures = scene.sys.textures;
  if (textures.exists(key)) textures.remove(key);
  const canvas = textures.createCanvas(key, atlasWidth, cellHeight);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx) return key;

  const base = Number.parseInt(hex, 16);
  const R = UI_FONT_LOOK;
  const ramp = R.ramp.map((t) => (t >= 0 ? mix(base, R.lightTone, t) : mix(base, 0x000000, -t)));
  const shadowColor = mix(base, 0x000000, R.shadowDarken);
  const chars: Record<number, unknown> = {};
  let left = 0;
  for (const [char, glyph] of glyphs) {
    const w = cellWidth(glyph.width);
    // Lewy górny róg piksela fontu (x, y) w teksturze.
    const at = (x: number, y: number) => ({ x: left + o + x * px, y: o + (y - FONT_TOP_ROW) * px });
    const layer = (dx: number, dy: number, fill: string): void => {
      ctx.fillStyle = fill;
      for (const p of glyph.pixels) {
        const { x, y } = at(p.x, p.y);
        ctx.fillRect(x + dx, y + dy, px, px);
      }
    };
    // Cień pod literą, potem obrys krzyżem (bez rogów — litera ma ścięte narożniki jak POLEGŁEŚ).
    layer(0, shadow, shadowColor);
    for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]] as const) layer(dx, dy, INK);
    // Lico paskami rampy: wierzch jasny, spód ciemny.
    for (const p of glyph.pixels) {
      const { x, y } = at(p.x, p.y);
      for (let dy = 0; dy < px; dy += look.strip) {
        ctx.fillStyle = ramp[rampIndex(p.y * px + dy, look, ramp.length)] ?? `#${hex}`;
        ctx.fillRect(x, y + dy, px, Math.min(look.strip, px - dy));
      }
    }
    const code = char.codePointAt(0) ?? 63;
    chars[code] = {
      x: left,
      y: 0,
      width: w,
      height: cellHeight,
      centerX: Math.floor(w / 2),
      centerY: Math.floor(cellHeight / 2),
      xOffset: -o,
      yOffset: 0,
      xAdvance: glyph.width * px + look.gap,
      data: {},
      kerning: {},
      u0: left / atlasWidth,
      v0: 0,
      u1: (left + w) / atlasWidth,
      v1: 1,
    };
    left += w + ATLAS_PADDING;
  }
  canvas.refresh();
  // `size` = piksel fontu: BitmapText w wielkości `px` rysuje teksturę 1:1.
  cache.add(key, {
    data: { font: key, size: px, lineHeight: FONT_LINE_HEIGHT * px, chars },
    texture: key,
    frame: null,
  });
  return key;
}
