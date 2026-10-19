import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import type { Rgba } from '../helpers/png';
import { pixel, readPng } from '../helpers/png';
import { evaluateReadability, floorReference, hex, spriteColors } from '../helpers/readability';
import { TILESETS_DIR, loadTileset } from '../helpers/tileset';

/** Sprite'y Barona Dymu i jego psa z generatora tools/smoker_sprites.py (krok 83): piksele pełne, bez barw zarezerwowanych, czytelność. */
const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));
const RESERVED = ['#000000', '#ffffff', '#9cff57'];

const sheets = [SPRITE_SHEETS.smokeBaron, SPRITE_SHEETS.blackDog, SPRITE_SHEETS.smokePuff, SPRITE_SHEETS.energyCan] as const;

describe('Baron Dymu i dog: arkusze', () => {
  it.each(sheets.map((s) => [s.url, s] as const))('%s: wymiary jak w spriteConfig, piksele pełne, bez barw zarezerwowanych', (_url, sheet) => {
    const img = readPng(PUBLIC + sheet.url);
    expect([img.width, img.height]).toEqual([sheet.sheetWidth, sheet.sheetHeight]);
    const colors = new Set<string>();
    let translucent = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3]!;
      if (a !== 0 && a !== 255) translucent++;
      if (a === 255) colors.add(hex([img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, a]));
    }
    expect(translucent).toBe(0);
    for (const c of RESERVED) expect(colors.has(c), c).toBe(false);
  });

  it('liczba kolumn i wierszy zgadza się z animacjami', () => {
    const baron = SPRITE_SHEETS.smokeBaron;
    expect(baron.sheetWidth / baron.frameWidth).toBe(20);
    expect(baron.sheetHeight / baron.frameHeight).toBe(8);
    const dog = SPRITE_SHEETS.blackDog;
    expect(dog.sheetWidth / dog.frameWidth).toBe(8);
    expect(dog.sheetHeight / dog.frameHeight).toBe(8);
  });
});

describe('Baron Dymu i dog: czytelność na podłodze palarni (progi §6a)', () => {
  const tileset = loadTileset('smoke_den_tileset.json');
  const ground = readPng(TILESETS_DIR + tileset.image);
  const floorPixels = (tileset.groups.floor ?? []).flatMap((name) => {
    const t = tileset.tiles[name]!;
    const out: Rgba[] = [];
    for (let y = t.row * 32; y < t.row * 32 + 32; y++) for (let x = t.col * 32; x < t.col * 32 + 32; x++) out.push(pixel(ground, x, y));
    return out;
  });
  const floor = floorReference(floorPixels);

  it('Baron (każdy kierunek, klatka stania) i dog (każdy kierunek, klatka stania) spełniają progi', () => {
    const baron = readPng(PUBLIC + SPRITE_SHEETS.smokeBaron.url);
    const dog = readPng(PUBLIC + SPRITE_SHEETS.blackDog.url);
    for (let row = 0; row < 8; row++) {
      const b = evaluateReadability(spriteColors(baron, { x: 0, y: row * 128, w: 128, h: 128 }), floor);
      expect(b.passes, `Baron, wiersz ${row}: ${JSON.stringify(b)}`).toBe(true);
      const d = evaluateReadability(spriteColors(dog, { x: 0, y: row * 80, w: 80, h: 80 }), floor);
      expect(d.passes, `dog, wiersz ${row}: ${JSON.stringify(d)}`).toBe(true);
    }
  });
});
