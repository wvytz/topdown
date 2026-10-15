/**
 * Ekran śmierci (krok 35; od kroku 39 „krwawa” wersja): mocno przyciemniona gra pod spodem,
 * za napisem plama krwi z rozbryzgami, czerwony napis POLEGŁEŚ ociekający krwią,
 * a na środku wynik i tablica rekordów.
 */
import { SPLASH_PALETTE } from '@/config/splashConfig';

/** Krew: rampa oczu z systemu „Matka Pająków” + ciemne tony zakrzepłej krwi. */
export const DEATH_PALETTE = {
  ...SPLASH_PALETTE,
  blood0: 0x3e0f14,
  blood1: 0x6e1a1f,
  blood2: 0x8c1f24,
} as const;

/** Lico liter POLEGŁEŚ: od jasnej czerwieni do ciemnej krwi (wiersze 0–6 fontu; akcent Ś ma kolor wiersza 0). */
export const DEATH_TITLE_BANDS = [
  DEATH_PALETTE.eye2,
  DEATH_PALETTE.eye1,
  DEATH_PALETTE.eye1,
  DEATH_PALETTE.eye1,
  DEATH_PALETTE.eye0,
  DEATH_PALETTE.eye0,
  DEATH_PALETTE.blood2,
] as const;

/** Kolory kropel krwi (losowane wizualnie). */
export const DEATH_BLOOD_COLORS = [DEATH_PALETTE.eye1, DEATH_PALETTE.eye0, DEATH_PALETTE.blood2] as const;

/** Oś czasu w ms od chwili śmierci. */
export const DEATH_TIMING = {
  /** Przyciemnienie gry narasta do `dimAlpha` — gra pod spodem ledwo prześwituje. */
  dimDuration: 600,
  dimAlpha: 0.8,
  /** Uderzenie POLEGŁEŚ; w tej samej chwili rozpryskuje się plama. */
  slamAt: 250,
  slamDuration: 180,
  slamFromScale: 2.2,
  slamUndershoot: 0.94,
  slamOvershoot: 1.04,
  settleDuration: 160,
  flashAlpha: 0.4,
  flashDuration: 260,
  shakeDuration: 300,
  shakeIntensity: 0.009,
  /** Plama: rozprysk od zera z lekkim przestrzeleniem, potem stoi. */
  splatGrowMs: 140,
  splatOvershoot: 1.08,
  splatSettleMs: 120,
  /** Wynik i nagłówek tablicy wchodzą po uderzeniu. */
  scoreAt: 700,
  scoreFadeDuration: 250,
  /** Wiersze tablicy pojawiają się po kolei jak na automacie. */
  rowsAt: 950,
  rowInterval: 110,
  /** „R — nowa wspinaczka” miga od tej chwili. */
  promptAt: 1700,
  promptBlinkPeriod: 900,
  promptOnFraction: 0.65,
} as const;

export type DeathTiming = typeof DEATH_TIMING;

/** Krew spływająca z dolnych krawędzi liter: strugi rosną w dół, z czubka co jakiś czas odrywa się kropla. */
export const DEATH_DRIPS = {
  /** Sól strumienia RNG (losowość deterministyczna, choć efekt jest tylko wizualny). */
  salt: 0x0de4d,
  count: 13,
  /** Struga zaczyna cieknąć po uderzeniu (ms od śmierci) z rozrzutem. */
  startAt: 500,
  startSpread: 1200,
  /** Czas, w którym struga osiąga pełną długość (spowalnia pod koniec). */
  minGrowMs: 1500,
  maxGrowMs: 4500,
  /** Długość strugi w pikselach ekranu. */
  minLength: 18,
  maxLength: 84,
  /** Gdy struga jest pełna, z czubka odrywają się krople. */
  minDropPeriodMs: 1300,
  maxDropPeriodMs: 3200,
} as const;

export type DeathDripConfig = typeof DEATH_DRIPS;

/** Plama krwi za napisem: zlepek kół + rozbryzgi wokół (w komórkach po `cell` px). */
export const DEATH_SPLAT = {
  salt: 0x5b1a7,
  cell: 4,
  /** Półosie głównej plamy (komórki). */
  rx: 74,
  ry: 16,
  blobCount: 18,
  blobMinRadius: 4,
  blobMaxRadius: 9,
  /** Drobne krople tuż za brzegiem plamy (1,0–1,3 półosi). */
  dropletCount: 34,
  dropletMaxRadius: 1.6,
  /** Rozbryzgi: promieniste smugi kropel wychodzące z plamy. */
  streakCount: 9,
  streakLength: 12,
  /** Ułamek komórek wnętrza z jaśniejszym połyskiem świeżej krwi. */
  sheenChance: 0.04,
} as const;

export type DeathSplatConfig = typeof DEATH_SPLAT;

/** Fizyka kropel (piksele ekranu, ms). */
export const DEATH_PARTICLES = {
  gravity: 0.0012,
  /** Chmura kropel przy uderzeniu napisu. */
  burstCount: 46,
  burstSpeedMin: 0.15,
  burstSpeedMax: 0.55,
  burstLifeMs: 1400,
  /** Kropla oderwana od strugi. */
  dropLifeMs: 1200,
} as const;

/** Układ (płótno 960×540). */
export const DEATH_LAYOUT = {
  centerX: 480,
  title: { centerY: 120, unit: 10, gap: 1, extrude: 3 },
  /** Struga: szerokość, czubek (kropla) szerszy i dłuższy. */
  drip: { width: 6, tipWidth: 8, tipHeight: 8 },
  score: { y: 246, fontSize: 16 },
  ornament: { y: 278, width: 96, gap: 14 },
  header: { y: 298, fontSize: 13 },
  rows: { y: 322, step: 24, fontSize: 15 },
  prompt: { y: 476, fontSize: 15 },
  /** Ciemny pas pod tablicą dla czytelności. */
  band: { y: 232, height: 230, width: 520, alpha: 0.5 },
  vignetteAlpha: 0.85,
} as const;
