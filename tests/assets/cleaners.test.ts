import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import { readPng } from '../helpers/png';
import { hex } from '../helpers/readability';

/** Sprite'y sprzątaczek i ich efektów z generatora tools/cleaner_sprites.py (kroki 125–126). */
const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));
const RESERVED = ['#000000', '#ffffff', '#9cff57'];

const sheets = [
  SPRITE_SHEETS.cleanerBlonde,
  SPRITE_SHEETS.cleanerBlondeDeath,
  SPRITE_SHEETS.soapPuddle,
  SPRITE_SHEETS.waterSplash,
  SPRITE_SHEETS.plasticBucket,
  SPRITE_SHEETS.serviceElevator,
  SPRITE_SHEETS.polishSparkle,
] as const;

describe('sprzątaczki: arkusze', () => {
  it.each(sheets.map((s) => [s.url, s] as const))('%s: wymiary jak w spriteConfig, piksele pełne, bez barw zarezerwowanych', (_url, sheet) => {
    const img = readPng(PUBLIC + sheet.url);
    expect([img.width, img.height]).toEqual([sheet.sheetWidth, sheet.sheetHeight]);
    let translucent = 0;
    const colors = new Set<string>();
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3]!;
      if (a !== 0 && a !== 255) translucent++;
      if (a === 255) colors.add(hex([img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, a]));
    }
    expect(translucent).toBe(0);
    for (const c of RESERVED) expect(colors.has(c), c).toBe(false);
  });

  it('klatki animacji mieszczą się w arkuszu', () => {
    for (const sheet of sheets) {
      const columns = sheet.sheetWidth / sheet.frameWidth;
      for (const animation of Object.values(sheet.animations)) for (const frame of animation.frames) expect(frame).toBeLessThan(columns);
    }
  });
});
