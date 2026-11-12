import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FONT_BOTTOM_ROW,
  FONT_FALLBACK,
  FONT_GLYPHS,
  FONT_LETTER_GAP,
  FONT_TOP_ROW,
  fontCharFor,
  fontLook,
  rampIndex,
  layoutLine,
  measureLine,
  toCapsText,
  toFontText,
  wrapText,
} from '@/core/pixelFont';
import { UI_FONT_LOOK } from '@/config/uiConfig';

const SRC = fileURLToPath(new URL('../../src', import.meta.url));

/** Znaki z literałów napisów w plikach, które trafiają na ekran (config, sceny, efekty, telefon). */
function uiCharacters(): Set<string> {
  const dirs = ['config', 'scenes', 'effects', 'mobile', 'systems'];
  const chars = new Set<string>();
  for (const dir of dirs) {
    for (const name of readdirSync(join(SRC, dir))) {
      if (!name.endsWith('.ts')) continue;
      const source = readFileSync(join(SRC, dir, name), 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line))
        .join('\n');
      for (const match of source.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
        for (const char of match[1] ?? match[2] ?? '') chars.add(char);
      }
    }
  }
  return chars;
}

describe('pikselowy krój pisma (krok U7)', () => {
  it('ma wszystkie litery polskiego alfabetu, cyfry i podstawową interpunkcję', () => {
    const required = 'AĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻaąbcćdeęfghijklłmnńoópqrsśtuvwxyzźż0123456789 .,:;!?-—–·/()[]%+×★▶◀→';
    for (const char of required) expect(FONT_GLYPHS.has(char), char).toBe(true);
  });

  it('każdy piksel mieści się w komórce znaku', () => {
    for (const [char, glyph] of FONT_GLYPHS) {
      for (const { x, y } of glyph.pixels) {
        expect(y, char).toBeGreaterThanOrEqual(FONT_TOP_ROW);
        expect(y, char).toBeLessThanOrEqual(FONT_BOTTOM_ROW);
        expect(x, char).toBeGreaterThanOrEqual(0);
        expect(x, char).toBeLessThan(glyph.width);
      }
    }
  });

  it('akcenty nie dotykają liter (pusty wiersz pod kreską)', () => {
    for (const char of 'ĆŃÓŚŹŻ') {
      const rows = new Set(FONT_GLYPHS.get(char)?.pixels.map((p) => p.y));
      expect(rows.has(-1), char).toBe(false);
    }
    for (const char of 'ćńóśźż') {
      const rows = new Set(FONT_GLYPHS.get(char)?.pixels.map((p) => p.y));
      expect(rows.has(1), char).toBe(false);
    }
  });

  it('cyfry mają jedną szerokość (liczby w HUD-zie nie skaczą)', () => {
    const widths = new Set([...'0123456789'].map((d) => FONT_GLYPHS.get(d)?.width));
    expect(widths.size).toBe(1);
  });

  it('znaki spoza fontu: litera bez akcentu albo znak zastępczy', () => {
    expect(fontCharFor('é')).toBe('e');
    expect(fontCharFor('Ü')).toBe('U');
    expect(fontCharFor('\t')).toBe(' ');
    expect(fontCharFor('漢')).toBe(FONT_FALLBACK);
    expect(toFontText('Café\nok')).toBe('Cafe\nok');
  });

  it('każdy znak z napisów gry ma własny kształt w foncie', () => {
    const missing = [...uiCharacters()].filter((char) => char !== '\n' && fontCharFor(char) === FONT_FALLBACK && char !== FONT_FALLBACK);
    expect(missing).toEqual([]);
  });

  it('mierzy i łamie linie', () => {
    const a = FONT_GLYPHS.get('A')?.width ?? 0;
    expect(measureLine('AA')).toBe(2 * a + FONT_LETTER_GAP);
    expect(measureLine('')).toBe(0);
    const lines = wrapText('Pokonaj bossa aby otworzyć schody', measureLine('Pokonaj bossa'));
    expect(lines[0]).toBe('Pokonaj bossa');
    for (const line of lines) expect(measureLine(line)).toBeLessThanOrEqual(measureLine('Pokonaj bossa'));
    expect(wrapText('a\nb', 100)).toEqual(['a', 'b']);
  });

  it('układa piksele liter jedna za drugą', () => {
    const pixels = layoutLine('I.');
    const i = FONT_GLYPHS.get('I')?.width ?? 0;
    expect(pixels.some((p) => p.x === i + FONT_LETTER_GAP && p.y === 6)).toBe(true);
  });

  it('recepta liter jak POLEGŁEŚ: przy pikselu 8 obrys 2 i cień 4, przy drobnym napisie obrys 1', () => {
    expect(fontLook(8, UI_FONT_LOOK)).toMatchObject({ px: 8, outline: 2, shadow: 4, strip: 2 });
    expect(fontLook(1, UI_FONT_LOOK)).toMatchObject({ px: 1, outline: 1, strip: 1 });
    // Szersze odstępy: przy pikselu 2 odstęp liter to 3 px płótna zamiast 2.
    expect(fontLook(2, UI_FONT_LOOK).gap).toBe(3);
  });

  it('rampa lica: akcent bierze pierwszy ton, spód wersalika i ogonek — ostatni', () => {
    const look = fontLook(4, UI_FONT_LOOK);
    const n = UI_FONT_LOOK.ramp.length;
    expect(rampIndex(-4, look, n)).toBe(0);
    expect(rampIndex(0, look, n)).toBe(0);
    expect(rampIndex(7 * 4 - 1, look, n)).toBe(n - 1);
    expect(rampIndex(7 * 4 + 3, look, n)).toBe(n - 1);
    expect(rampIndex(14, look, n)).toBeGreaterThan(rampIndex(4, look, n));
  });

  it('wersaliki: polskie litery przechodzą na wielkie, znaki spoza fontu jak zwykle', () => {
    expect(toCapsText('Moje przedmioty · żółć ×2')).toBe('MOJE PRZEDMIOTY · ŻÓŁĆ ×2');
    expect(toCapsText('dwa\nwiersze')).toBe('DWA\nWIERSZE');
  });
});
