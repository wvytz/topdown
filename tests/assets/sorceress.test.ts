import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import type { Rgba } from '../helpers/png';
import { pixel, readPng } from '../helpers/png';
import { evaluateReadability, floorReference, hex, spriteColors } from '../helpers/readability';
import { TILESETS_DIR, loadTileset } from '../helpers/tileset';

/** Sprite'y Czarodziejki z generatora tools/sorceress_sprites.py: paleta i czytelność (STYLEGUIDE §4, §6a). */
const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));

/** Paleta zaakceptowana przez właściciela: obrys, włosy, suknia, skóra, kostur, kryształ. */
const PALETTE = new Set([
  '#1b1a22',
  '#282a3c', '#353b55', '#48516f', '#63708f',
  '#1c1f5a', '#23378f', '#2d56b9', '#3d7bd3', '#7fb4ec',
  '#b9805e', '#e8b892',
  '#4a3020', '#5a3a22', '#5b3e27',
  '#1d7f9c', '#39c0d8', '#8ae6ef', '#e4fbfb',
]);
const RESERVED = ['#000000', '#ffffff', '#9cff57', '#d4a83a'];

const sheets = [SPRITE_SHEETS.sorceress, SPRITE_SHEETS.sorceressOrb] as const;

describe('Czarodziejka: paleta', () => {
  it.each(sheets.map((s) => [s.url, s] as const))('%s: tylko kolory palety, piksele pełne', (_url, sheet) => {
    const img = readPng(PUBLIC + sheet.url);
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

describe('Czarodziejka: czytelność na płytach (progi §6a)', () => {
  const tileset = loadTileset();
  const ground = readPng(TILESETS_DIR + tileset.image);
  const floorPixels = (tileset.groups.floor ?? []).flatMap((name) => {
    const t = tileset.tiles[name]!;
    const out: Rgba[] = [];
    for (let y = t.row * 32; y < t.row * 32 + 32; y++) for (let x = t.col * 32; x < t.col * 32 + 32; x++) out.push(pixel(ground, x, y));
    return out;
  });
  const floor = floorReference(floorPixels);

  it('postać (każdy kierunek, klatka stania) i kula spełniają progi', () => {
    const hero = readPng(PUBLIC + SPRITE_SHEETS.sorceress.url);
    for (let row = 0; row < 8; row++) {
      const r = evaluateReadability(spriteColors(hero, { x: 0, y: row * 48, w: 48, h: 48 }), floor);
      expect(r.passes, `wiersz ${row}: ${JSON.stringify(r)}`).toBe(true);
    }
    const orb = readPng(PUBLIC + SPRITE_SHEETS.sorceressOrb.url);
    const r = evaluateReadability(spriteColors(orb, { x: 0, y: 0, w: 16, h: 16 }), floor);
    expect(r.passes, JSON.stringify(r)).toBe(true);
  });
});
