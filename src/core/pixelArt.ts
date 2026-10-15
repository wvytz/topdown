/** Proste narzędzia pixel artu bez silnika: font 5×7 do logo i linia Bresenhama (ekran startowy, krok 34). */

export interface PixelCell {
  readonly x: number;
  readonly y: number;
}

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;

/** Litery w stylu automatów, 5×7 pikseli; „#” = piksel. Tylko znaki potrzebne w napisach (logo, POLEGŁEŚ). */
export const PIXEL_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  Ł: ['.#...', '.#...', '.#.#.', '.##..', '##...', '.#...', '.####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

/** Litery z akcentem nad znakiem: litera bazowa + piksele akcentu (ujemne y = nad linią liter). */
export const PIXEL_ACCENTED: Readonly<Record<string, { readonly base: string; readonly accent: readonly PixelCell[] }>> = {
  Ś: { base: 'S', accent: [{ x: 3, y: -3 }, { x: 2, y: -2 }] },
};

export interface PixelText {
  readonly cells: readonly PixelCell[];
  /** Szerokość w pikselach fontu (przed skalowaniem). */
  readonly width: number;
  /** Wysokość liter (7) — bez akcentów; akcenty sięgają do `top` (≤ 0). */
  readonly height: number;
  /** Najwyższy wiersz napisu: 0 albo ujemny, gdy są akcenty. */
  readonly top: number;
}

/** Rozkłada napis na piksele fontu 5×7; `gap` = odstęp między literami w pikselach fontu. */
export function pixelText(text: string, gap: number): PixelText {
  const cells: PixelCell[] = [];
  const chars = [...text.toUpperCase()];
  chars.forEach((char, index) => {
    const accented = PIXEL_ACCENTED[char];
    const glyph = PIXEL_GLYPHS[accented ? accented.base : char];
    if (!glyph) throw new Error(`Brak znaku „${char}” w foncie pikselowym`);
    const left = index * (GLYPH_WIDTH + gap);
    for (const { x, y } of accented?.accent ?? []) cells.push({ x: left + x, y });
    glyph.forEach((row, y) => {
      [...row].forEach((pixel, x) => {
        if (pixel === '#') cells.push({ x: left + x, y });
      });
    });
  });
  const width = chars.length === 0 ? 0 : chars.length * GLYPH_WIDTH + (chars.length - 1) * gap;
  const top = Math.min(0, ...cells.map((c) => c.y));
  return { cells, width, height: GLYPH_HEIGHT, top };
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
