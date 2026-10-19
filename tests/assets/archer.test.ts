import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import type { Rgba } from '../helpers/png';
import { pixel, readPng } from '../helpers/png';
import { evaluateReadability, floorReference, hex, spriteColors } from '../helpers/readability';
import { TILESETS_DIR, loadTileset } from '../helpers/tileset';

/** Sprite'y łucznika z generatora tools/archer_sprites.py (krok 82): paleta i czytelność (STYLEGUIDE §4, §6a). */
const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));

/** Paleta generatora: obrys, peleryna, skóra (kaftan, kołczan), drewno, cięciwa, grot, lotki, skóra dłoni. */
const PALETTE = new Set([
  '#1b1a22',
  '#1f3a24', '#2c5232', '#3f6e3f', '#5b8f4f', '#86b866',
  '#3a2616', '#5a3c22', '#7a5530',
  '#4a3020', '#6e4a2a', '#9a6a3a',
  '#d8d0b8',
  '#8a94a4', '#c8d0dc',
  '#a8352c', '#d65a48',
  '#b9805e', '#e8b892',
]);
const RESERVED = ['#000000', '#ffffff', '#9cff57', '#d4a83a'];

const sheets = [SPRITE_SHEETS.archer, SPRITE_SHEETS.archerArrow] as const;

describe('łucznik: paleta', () => {
  it.each(sheets.map((s) => [s.url, s] as const))('%s: tylko kolory palety, piksele pełne, wymiary jak w spriteConfig', (_url, sheet) => {
    const img = readPng(PUBLIC + sheet.url);
    expect([img.width, img.height]).toEqual([sheet.sheetWidth, sheet.sheetHeight]);
    const colors = new Set<string>();
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const p = pixel(img, x, y);
        expect([0, 255]).toContain(p[3]);
        if (p[3] === 255) colors.add(hex(p));
      }
    }
    for (const c of colors) expect(PALETTE, c).toContain(c);
    for (const c of RESERVED) expect(colors.has(c), c).toBe(false);
  });
});

describe('łucznik: czytelność na płytach (progi §6a)', () => {
  const tileset = loadTileset();
  const ground = readPng(TILESETS_DIR + tileset.image);
  const floorPixels = (tileset.groups.floor ?? []).flatMap((name) => {
    const t = tileset.tiles[name]!;
    const out: Rgba[] = [];
    for (let y = t.row * 32; y < t.row * 32 + 32; y++) for (let x = t.col * 32; x < t.col * 32 + 32; x++) out.push(pixel(ground, x, y));
    return out;
  });
  const floor = floorReference(floorPixels);

  it('postać (każdy kierunek, klatka stania) i strzała spełniają progi', () => {
    const hero = readPng(PUBLIC + SPRITE_SHEETS.archer.url);
    for (let row = 0; row < 8; row++) {
      const r = evaluateReadability(spriteColors(hero, { x: 0, y: row * 48, w: 48, h: 48 }), floor);
      expect(r.passes, `wiersz ${row}: ${JSON.stringify(r)}`).toBe(true);
    }
    const arrow = readPng(PUBLIC + SPRITE_SHEETS.archerArrow.url);
    const r = evaluateReadability(spriteColors(arrow, { x: 0, y: 32, w: 16, h: 16 }), floor);
    expect(r.passes, JSON.stringify(r)).toBe(true);
  });
});
