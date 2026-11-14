/**
 * Pikselowy krój pisma interfejsu (krok U7): jeden font na wszystkich ekranach gry, bez silnika.
 *
 * Siatka znaku: wiersz 0 = góra wersalika, wersaliki i cyfry mają 7 wierszy (0–6), małe litery — 5 (2–6),
 * wydłużenia w górę sięgają wiersza 0, w dół — do 8. Akcenty wersalików leżą w wierszach −3…−2 (wiersz −1
 * zostaje pusty, żeby kreska nie zlewała się z literą). Szerokość znaku jest zmienna (proporcjonalny krój),
 * cyfry mają jedną szerokość, żeby liczby w HUD-zie nie skakały.
 *
 * Warstwa Phasera (`ui/PixelFont.ts`) wypala z tych danych teksturę z obrysem 1 px; telefon rysuje je na płótnie.
 */

/** Najwyższy i najniższy wiersz komórki znaku (akcenty wersalików, wydłużenia małych liter). */
export const FONT_TOP_ROW = -3;
export const FONT_BOTTOM_ROW = 8;
/** Wysokość komórki znaku w pikselach fontu (bez obrysu). */
export const FONT_CELL_HEIGHT = FONT_BOTTOM_ROW - FONT_TOP_ROW + 1;
/** Odstęp między znakami (piksele fontu); obrys sąsiednich liter wypada we wspólnej kolumnie. */
export const FONT_LETTER_GAP = 1;
/** Odstęp między wierszami tekstu (piksele fontu). */
export const FONT_LINE_HEIGHT = 12;
/** Znak zastępczy dla znaków spoza fontu. */
export const FONT_FALLBACK = '?';

export interface FontPixel {
  readonly x: number;
  readonly y: number;
}

/** Wzór znaku: `rows` od wiersza `top` w dół; „#” = piksel. */
interface GlyphPattern {
  readonly top: number;
  readonly rows: readonly string[];
}

/** Gotowy znak: piksele względem lewego brzegu i wiersza 0, szerokość (bez odstępu). */
export interface FontGlyph {
  readonly width: number;
  readonly pixels: readonly FontPixel[];
}

const caps = (...rows: string[]): GlyphPattern => ({ top: 0, rows });
const lower = (...rows: string[]): GlyphPattern => ({ top: 2, rows });
const at = (top: number, ...rows: string[]): GlyphPattern => ({ top, rows });

/** Wzory znaków podstawowych. */
const PATTERNS: Readonly<Record<string, GlyphPattern>> = {
  A: caps('.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'),
  B: caps('####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'),
  C: caps('.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'),
  D: caps('####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'),
  E: caps('#####', '#....', '#....', '####.', '#....', '#....', '#####'),
  F: caps('#####', '#....', '#....', '####.', '#....', '#....', '#....'),
  G: caps('.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'),
  H: caps('#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'),
  I: caps('###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'),
  J: caps('..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'),
  K: caps('#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'),
  L: caps('#....', '#....', '#....', '#....', '#....', '#....', '#####'),
  M: caps('#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'),
  N: caps('#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'),
  O: caps('.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'),
  P: caps('####.', '#...#', '#...#', '####.', '#....', '#....', '#....'),
  Q: caps('.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'),
  R: caps('####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'),
  S: caps('.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'),
  T: caps('#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'),
  U: caps('#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'),
  V: caps('#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'),
  W: caps('#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'),
  X: caps('#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'),
  Y: caps('#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'),
  Z: caps('#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'),
  Ł: caps('#....', '#....', '#.#..', '##...', '#....', '#....', '#####'),

  a: lower('.##.', '...#', '.###', '#..#', '.###'),
  b: caps('#...', '#...', '###.', '#..#', '#..#', '#..#', '###.'),
  c: lower('.###', '#...', '#...', '#...', '.###'),
  d: caps('...#', '...#', '.###', '#..#', '#..#', '#..#', '.###'),
  e: lower('.##.', '#..#', '####', '#...', '.###'),
  f: caps('.##', '#..', '###', '#..', '#..', '#..', '#..'),
  g: lower('.###', '#..#', '#..#', '#..#', '.###', '...#', '###.'),
  h: caps('#...', '#...', '###.', '#..#', '#..#', '#..#', '#..#'),
  i: caps('#', '.', '#', '#', '#', '#', '#'),
  j: caps('.#', '..', '.#', '.#', '.#', '.#', '.#', '.#', '#.'),
  k: caps('#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#'),
  l: caps('#.', '#.', '#.', '#.', '#.', '#.', '.#'),
  m: lower('##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'),
  n: lower('###.', '#..#', '#..#', '#..#', '#..#'),
  o: lower('.##.', '#..#', '#..#', '#..#', '.##.'),
  p: lower('###.', '#..#', '#..#', '#..#', '###.', '#...', '#...'),
  q: lower('.###', '#..#', '#..#', '#..#', '.###', '...#', '...#'),
  r: lower('#.##', '##..', '#...', '#...', '#...'),
  s: lower('.###', '#...', '.##.', '...#', '###.'),
  t: caps('.#.', '.#.', '###', '.#.', '.#.', '.#.', '..#'),
  u: lower('#..#', '#..#', '#..#', '#..#', '.###'),
  v: lower('#...#', '#...#', '.#.#.', '.#.#.', '..#..'),
  w: lower('#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'),
  x: lower('#..#', '#..#', '.##.', '#..#', '#..#'),
  y: lower('#..#', '#..#', '#..#', '#..#', '.###', '...#', '###.'),
  z: lower('####', '...#', '.##.', '#...', '####'),
  ł: caps('.#.', '.#.', '.##', '##.', '.#.', '.#.', '.#.'),

  '0': caps('.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'),
  '1': caps('..#.', '.##.', '..#.', '..#.', '..#.', '..#.', '.###'),
  '2': caps('.##.', '#..#', '...#', '..#.', '.#..', '#...', '####'),
  '3': caps('###.', '...#', '...#', '.##.', '...#', '...#', '###.'),
  '4': caps('#..#', '#..#', '#..#', '####', '...#', '...#', '...#'),
  '5': caps('####', '#...', '###.', '...#', '...#', '#..#', '.##.'),
  '6': caps('.##.', '#...', '#...', '###.', '#..#', '#..#', '.##.'),
  '7': caps('####', '...#', '..#.', '..#.', '.#..', '.#..', '.#..'),
  '8': caps('.##.', '#..#', '#..#', '.##.', '#..#', '#..#', '.##.'),
  '9': caps('.##.', '#..#', '#..#', '.###', '...#', '...#', '.##.'),

  ' ': at(0, '..'),
  '.': at(6, '#'),
  ',': at(6, '.#', '#.'),
  ':': at(3, '#', '.', '.', '#'),
  ';': at(3, '.#', '..', '..', '.#', '#.'),
  '!': caps('#', '#', '#', '#', '#', '.', '#'),
  '?': caps('.##.', '#..#', '...#', '..#.', '.#..', '....', '.#..'),
  '-': at(4, '###'),
  '−': at(4, '####'),
  '–': at(4, '####'),
  '—': at(4, '#####'),
  '_': at(7, '#####'),
  '·': at(4, '#'),
  '•': at(3, '##', '##'),
  '/': caps('..#', '..#', '.#.', '.#.', '.#.', '#..', '#..'),
  '\\': caps('#..', '#..', '.#.', '.#.', '.#.', '..#', '..#'),
  '|': caps('#', '#', '#', '#', '#', '#', '#'),
  '(': caps('.#', '#.', '#.', '#.', '#.', '#.', '.#'),
  ')': caps('#.', '.#', '.#', '.#', '.#', '.#', '#.'),
  '[': caps('##', '#.', '#.', '#.', '#.', '#.', '##'),
  ']': caps('##', '.#', '.#', '.#', '.#', '.#', '##'),
  '%': caps('##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'),
  '+': at(3, '.#.', '###', '.#.'),
  '×': at(3, '#.#', '.#.', '#.#'),
  '=': at(3, '####', '....', '####'),
  '<': at(1, '..#', '.#.', '#..', '.#.', '..#'),
  '>': at(1, '#..', '.#.', '..#', '.#.', '#..'),
  "'": at(0, '#', '#'),
  '"': at(0, '#.#', '#.#'),
  '„': at(6, '#.#', '#.#'),
  '”': at(0, '#.#', '#.#'),
  '“': at(0, '#.#', '#.#'),
  '…': at(6, '#.#.#'),
  '#': at(1, '.#.#.', '#####', '.#.#.', '#####', '.#.#.'),
  '*': at(1, '#.#', '.#.', '#.#'),
  '&': caps('.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'),
  '@': caps('.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'),
  '$': caps('..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'),
  '^': at(0, '.#.', '#.#'),
  '~': at(3, '.#.#', '#.#.'),
  '°': at(0, '###', '#.#', '###'),
  '★': at(1, '..#..', '..#..', '#####', '.###.', '.#.#.', '#...#'),
  '☆': at(1, '..#..', '..#..', '##.##', '.#.#.', '.#.#.', '#...#'),
  '♥': at(2, '##.##', '#####', '.###.', '..#..'),
  '▶': at(1, '#..', '##.', '###', '##.', '#..'),
  '◀': at(1, '..#', '.##', '###', '.##', '..#'),
  '▲': at(2, '..#..', '.###.', '#####'),
  '▼': at(2, '#####', '.###.', '..#..'),
  '→': at(3, '...#.', '#####', '...#.'),
  '←': at(3, '.#...', '#####', '.#...'),
  '↑': at(1, '..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..'),
  '↓': at(1, '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..'),
  '✓': at(2, '....#', '...#.', '#.#..', '.#...'),
  '✕': at(2, '#...#', '.#.#.', '..#..', '.#.#.', '#...#'),
  '▸': at(2, '#..', '##.', '###', '##.', '#..'),
  '◂': at(2, '..#', '.##', '###', '.##', '..#'),
  '›': at(2, '#..', '.#.', '..#', '.#.', '#..'),
  '‹': at(2, '..#', '.#.', '#..', '.#.', '..#'),
  '◆': at(1, '..#..', '.###.', '#####', '.###.', '..#..'),
  '≥': at(1, '#...', '.##.', '...#', '.##.', '#...', '....', '####'),
  '≤': at(1, '...#', '.##.', '#...', '.##.', '...#', '....', '####'),
  '{': caps('.##', '.#.', '.#.', '#..', '.#.', '.#.', '.##'),
  '}': caps('##.', '.#.', '.#.', '..#', '.#.', '.#.', '##.'),
  /** Dymek „Napisz do autora”. */
  '💬': at(0, '#####', '#...#', '#.#.#', '#...#', '#####', '.#...', '#....'),
};

/** Kreska nad wersalikiem i nad małą literą. */
const ACUTE_CAP: readonly FontPixel[] = [{ x: 3, y: -3 }, { x: 2, y: -2 }];
const ACUTE_LOW: readonly FontPixel[] = [{ x: 2, y: -1 }, { x: 1, y: 0 }];
/** Kropka nad Ż / ż. */
const DOT_CAP: readonly FontPixel[] = [{ x: 2, y: -2 }];
const DOT_LOW: readonly FontPixel[] = [{ x: 1, y: 0 }, { x: 2, y: 0 }];
/** Ogonek pod Ą, Ę, ą, ę. */
const OGONEK_CAP: readonly FontPixel[] = [{ x: 3, y: 7 }, { x: 4, y: 8 }];
const OGONEK_LOW: readonly FontPixel[] = [{ x: 2, y: 7 }, { x: 3, y: 8 }];

/** Litery z akcentem: litera bazowa + piksele akcentu. */
const ACCENTED: Readonly<Record<string, { readonly base: string; readonly marks: readonly FontPixel[] }>> = {
  Ą: { base: 'A', marks: OGONEK_CAP },
  Ć: { base: 'C', marks: ACUTE_CAP },
  Ę: { base: 'E', marks: OGONEK_CAP },
  Ń: { base: 'N', marks: ACUTE_CAP },
  Ó: { base: 'O', marks: ACUTE_CAP },
  Ś: { base: 'S', marks: ACUTE_CAP },
  Ź: { base: 'Z', marks: ACUTE_CAP },
  Ż: { base: 'Z', marks: DOT_CAP },
  ą: { base: 'a', marks: OGONEK_LOW },
  ć: { base: 'c', marks: ACUTE_LOW },
  ę: { base: 'e', marks: OGONEK_LOW },
  ń: { base: 'n', marks: ACUTE_LOW },
  ó: { base: 'o', marks: ACUTE_LOW },
  ś: { base: 's', marks: ACUTE_LOW },
  ź: { base: 'z', marks: ACUTE_LOW },
  ż: { base: 'z', marks: DOT_LOW },
};

function buildGlyph(pattern: GlyphPattern, marks: readonly FontPixel[] = []): FontGlyph {
  const pixels: FontPixel[] = [...marks];
  pattern.rows.forEach((row, dy) => {
    [...row].forEach((cell, x) => {
      if (cell === '#') pixels.push({ x, y: pattern.top + dy });
    });
  });
  const width = Math.max(...pattern.rows.map((row) => row.length));
  return { width, pixels };
}

function buildGlyphs(): ReadonlyMap<string, FontGlyph> {
  const glyphs = new Map<string, FontGlyph>();
  for (const [char, pattern] of Object.entries(PATTERNS)) glyphs.set(char, buildGlyph(pattern));
  for (const [char, { base, marks }] of Object.entries(ACCENTED)) {
    const pattern = PATTERNS[base];
    if (pattern) glyphs.set(char, buildGlyph(pattern, marks));
  }
  return glyphs;
}

/** Wszystkie znaki fontu (klucz = znak). */
export const FONT_GLYPHS: ReadonlyMap<string, FontGlyph> = buildGlyphs();

/**
 * Znak, którym font narysuje `char`: on sam, litera bez akcentu (é → e) albo znak zastępczy.
 * Tabulator i inne białe znaki stają się spacją.
 */
export function fontCharFor(char: string): string {
  if (FONT_GLYPHS.has(char)) return char;
  if (/^\s$/u.test(char)) return ' ';
  const plain = char.normalize('NFD').replace(/\p{Mn}/gu, '');
  if (plain.length === 1 && FONT_GLYPHS.has(plain)) return plain;
  const upper = char.toUpperCase();
  if (FONT_GLYPHS.has(upper)) return upper;
  return FONT_FALLBACK;
}

/** Tekst sprowadzony do znaków fontu (zachowuje znaki nowej linii). */
export function toFontText(text: string): string {
  return [...text].map((char) => (char === '\n' ? char : fontCharFor(char))).join('');
}

/**
 * Napis interfejsu wersalikami (krok U7b, decyzja właściciela: „wersaliki jak POLEGŁEŚ”) — po polsku
 * (ą → Ą), potem sprowadzony do znaków fontu.
 */
export function toCapsText(text: string): string {
  return toFontText(text.toLocaleUpperCase('pl-PL'));
}

function glyphOf(char: string): FontGlyph {
  return FONT_GLYPHS.get(fontCharFor(char)) ?? (FONT_GLYPHS.get(FONT_FALLBACK) as FontGlyph);
}

/** Szerokość jednej linii w pikselach fontu (bez obrysu). */
export function measureLine(line: string): number {
  const chars = [...line];
  if (chars.length === 0) return 0;
  return chars.reduce((sum, char) => sum + glyphOf(char).width, 0) + (chars.length - 1) * FONT_LETTER_GAP;
}

/** Łamie tekst na linie nie szersze niż `maxWidth` (piksele fontu); słowa dłuższe od linii zostają w całości. */
export function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (line !== '' && measureLine(candidate) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Położenie pikseli linii tekstu: x od lewego brzegu, y względem wiersza 0 (góra wersalików). */
export function layoutLine(line: string): FontPixel[] {
  const out: FontPixel[] = [];
  let pen = 0;
  for (const char of line) {
    const glyph = glyphOf(char);
    for (const { x, y } of glyph.pixels) out.push({ x: pen + x, y });
    pen += glyph.width + FONT_LETTER_GAP;
  }
  return out;
}

/** Recepta rysowania liter jednej wielkości (krok U7b, wzór: POLEGŁEŚ). Wszystko w pikselach płótna. */
export interface FontLook {
  /** Piksel fontu. */
  readonly px: number;
  readonly outline: number;
  /** Przesunięcie cienia w dół. */
  readonly shadow: number;
  readonly strip: number;
  /** Odstęp między literami. */
  readonly gap: number;
  /** Cień i rampa lica (duże napisy); drobne — płaskie lico z obrysem. */
  readonly effects: boolean;
}

export interface FontLookConfig {
  readonly effectsFromPx: number;
  readonly outlineFraction: number;
  readonly shadowOutlines: number;
  readonly stripPx: number;
  readonly extraGapFraction: number;
}

/** Recepta dla napisu w skali `size` (1 piksel fontu = `size` pikseli płótna). */
export function fontLook(size: number, config: FontLookConfig): FontLook {
  const px = Math.max(1, Math.round(size));
  const outline = Math.max(1, Math.round(px * config.outlineFraction));
  const effects = px >= config.effectsFromPx;
  return {
    px,
    outline,
    shadow: effects ? outline * config.shadowOutlines : 0,
    effects,
    strip: Math.max(1, Math.min(px, config.stripPx)),
    gap: FONT_LETTER_GAP * px + Math.round(px * config.extraGapFraction),
  };
}

/**
 * Ton rampy lica dla wiersza tekstury: `y` = piksel płótna liczony od wierzchu wersalika (wiersz 0 fontu),
 * ujemny nad literą. Zwraca indeks w rampie długości `rampLength` — akcenty dostają pierwszy ton, spód ostatni.
 */
export function rampIndex(y: number, look: FontLook, rampLength: number): number {
  const capHeight = 7 * look.px;
  const t = Math.floor(y / look.strip) * look.strip;
  if (t < 0) return 0;
  if (t >= capHeight) return rampLength - 1;
  return Math.min(rampLength - 1, Math.floor((t / capHeight) * rampLength));
}

