import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import { hex } from '../helpers/readability';
import { readPng } from '../helpers/png';

/** Ogień z generatora tools/fire_sprites.py (krok 144): wymiary, piksele pełne, bez barw zarezerwowanych. */
const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));
const RESERVED = ['#000000', '#ffffff', '#9cff57'];

const sheets = [SPRITE_SHEETS.fireBurst32, SPRITE_SHEETS.fireBurst64, SPRITE_SHEETS.fireFlame] as const;

describe('Ogień: arkusze', () => {
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
});
