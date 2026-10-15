/** Proste narzędzia pixel artu bez silnika: font 5×7 do logo i linia Bresenhama (ekran startowy, krok 34). */

export interface PixelCell {
  readonly x: number;
  readonly y: number;
}

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;

/** Litery w stylu automatów, 5×7 pikseli; „#” = piksel. Tylko znaki potrzebne w logo. */
export const PIXEL_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

export interface PixelText {
  readonly cells: readonly PixelCell[];
  /** Szerokość i wysokość w pikselach fontu (przed skalowaniem). */
  readonly width: number;
  readonly height: number;
}

/** Rozkłada napis na piksele fontu 5×7; `gap` = odstęp między literami w pikselach fontu. */
export function pixelText(text: string, gap: number): PixelText {
  const cells: PixelCell[] = [];
  const chars = [...text.toUpperCase()];
  chars.forEach((char, index) => {
    const glyph = PIXEL_GLYPHS[char];
    if (!glyph) throw new Error(`Brak znaku „${char}” w foncie pikselowym`);
    const left = index * (GLYPH_WIDTH + gap);
    glyph.forEach((row, y) => {
      [...row].forEach((pixel, x) => {
        if (pixel === '#') cells.push({ x: left + x, y });
      });
    });
  });
  const width = chars.length === 0 ? 0 : chars.length * GLYPH_WIDTH + (chars.length - 1) * gap;
  return { cells, width, height: GLYPH_HEIGHT };
}

/** Piksele odcinka między dwoma punktami siatki (Bresenham, oba końce włącznie). */
export function pixelLine(x0: number, y0: number, x1: number, y1: number): PixelCell[] {
  const cells: PixelCell[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    cells.push({ x, y });
    if (x === x1 && y === y1) return cells;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
