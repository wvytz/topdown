import { describe, expect, it } from 'vitest';
import { GLYPH_HEIGHT, GLYPH_WIDTH, PIXEL_GLYPHS, pixelLine, pixelText } from '@/core/pixelArt';

describe('font pikselowy 5×7', () => {
  it('każdy znak ma 7 wierszy po 5 pikseli z samych „#” i „.”', () => {
    for (const [char, rows] of Object.entries(PIXEL_GLYPHS)) {
      expect(rows, char).toHaveLength(GLYPH_HEIGHT);
      for (const row of rows) expect(row, char).toMatch(/^[#.]{5}$/);
    }
  });

  it('logo da się złożyć: TOWER i CRAWLER', () => {
    expect(() => pixelText('TOWER', 3)).not.toThrow();
    expect(() => pixelText('crawler', 1)).not.toThrow();
  });

  it('szerokość = litery + odstępy, piksele mieszczą się w ramce', () => {
    const text = pixelText('CRAWLER', 1);
    expect(text.width).toBe(7 * GLYPH_WIDTH + 6);
    expect(text.height).toBe(GLYPH_HEIGHT);
    for (const { x, y } of text.cells) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(text.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(text.height);
    }
  });

  it('druga litera zaczyna się po szerokości znaku i odstępie', () => {
    const text = pixelText('LT', 2);
    // Górna belka T zaczyna się w kolumnie 5 + 2.
    expect(text.cells.some(({ x, y }) => x === 7 && y === 0)).toBe(true);
    expect(text.cells.some(({ x }) => x === 5 || x === 6)).toBe(false);
  });

  it('nieznany znak to błąd, a nie dziura w logo', () => {
    expect(() => pixelText('TOWERZ', 1)).toThrow(/Z/);
  });
});

describe('pixelLine', () => {
  it('obejmuje oba końce i nie ma przerw', () => {
    const line = pixelLine(0, 0, 40, 26);
    expect(line[0]).toEqual({ x: 0, y: 0 });
    expect(line[line.length - 1]).toEqual({ x: 40, y: 26 });
    line.slice(1).forEach((cell, i) => {
      const prev = line[i]!;
      expect(Math.abs(cell.x - prev.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(cell.y - prev.y)).toBeLessThanOrEqual(1);
    });
  });

  it('działa w każdą stronę', () => {
    const line = pixelLine(239, 0, 204, 22);
    expect(line[line.length - 1]).toEqual({ x: 204, y: 22 });
    expect(line).toHaveLength(36);
  });
});
