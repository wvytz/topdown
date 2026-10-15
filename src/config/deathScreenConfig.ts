/**
 * Ekran śmierci (krok 35): przyciemniona gra pod spodem, rozkładający się napis POLEGŁEŚ
 * z kroplami krwi, a na środku wynik i tablica rekordów. Styl jak ekran startowy (krok 34).
 */
import { SPLASH_PALETTE } from '@/config/splashConfig';

/** Krew: rampa oczu z systemu „Matka Pająków” + dwa ciemniejsze tony zakrzepłej krwi. */
export const DEATH_PALETTE = {
  ...SPLASH_PALETTE,
  blood0: 0x3e0f14,
  blood1: 0x6e1a1f,
} as const;

/** Pasy w wierszach liter POLEGŁEŚ (wiersze 0–6 fontu; akcent Ś ma kolor wiersza 0). */
export const DEATH_TITLE_BANDS = [
  DEATH_PALETTE.eye2,
  DEATH_PALETTE.eye1,
  DEATH_PALETTE.eye1,
  DEATH_PALETTE.eye1,
  DEATH_PALETTE.eye0,
  DEATH_PALETTE.eye0,
  DEATH_PALETTE.blood1,
] as const;

/** Kolory kropel krwi (losowane wizualnie). */
export const DEATH_BLOOD_COLORS = [DEATH_PALETTE.eye1, DEATH_PALETTE.eye0, DEATH_PALETTE.blood1] as const;

/** Oś czasu w ms od chwili śmierci. */
export const DEATH_TIMING = {
  /** Przyciemnienie gry narasta do `dimAlpha` — gra pod spodem dalej jest widoczna. */
  dimDuration: 600,
  dimAlpha: 0.62,
  /** Uderzenie POLEGŁEŚ (jak CRAWLER na ekranie startowym). */
  slamAt: 250,
  slamDuration: 180,
  slamFromScale: 2.2,
  slamUndershoot: 0.94,
  slamOvershoot: 1.04,
  settleDuration: 160,
  flashAlpha: 0.45,
  flashDuration: 260,
  shakeDuration: 280,
  shakeIntensity: 0.008,
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

/** Rozkład napisu: bloki 2×2 na piksel fontu odpadają i spadają; napis zostaje czytelny. */
export const DEATH_CRUMBLE = {
  /** Sól strumienia RNG rozkładu (losowość deterministyczna, choć efekt jest tylko wizualny). */
  salt: 0x0de4d,
  /** Ile bloków na bok piksela fontu. */
  blocksPerPixel: 2,
  startAt: 1200,
  /** Okno odpadania: bloki brzegowe w pierwszej części, wewnętrzne później. */
  duration: 7000,
  edgeChance: 0.3,
  innerChance: 0.06,
  /** Wewnętrzne bloki odpadają nie wcześniej niż po tej części okna. */
  innerDelayFraction: 0.5,
  /** Górny limit odpadniętych bloków — napis musi zostać czytelny. */
  maxFraction: 0.3,
  /** Źródła cieknącej krwi na dolnych krawędziach liter. */
  dripCount: 7,
  dripMinPeriodMs: 1400,
  dripMaxPeriodMs: 2800,
} as const;

export type DeathCrumbleConfig = typeof DEATH_CRUMBLE;

/** Fizyka kropel i odłamków (piksele ekranu, ms). */
export const DEATH_PARTICLES = {
  gravity: 0.0012,
  /** Chmura kropel przy uderzeniu napisu. */
  burstCount: 46,
  burstSpeedMin: 0.15,
  burstSpeedMax: 0.55,
  burstLifeMs: 1400,
  /** Kropla z krawędzi litery: nabrzmiewa, potem spada. */
  dripSwellMs: 450,
  dripLifeMs: 1100,
  /** Odłamki liter: lekki dryf w bok, gaśnięcie. */
  shardDriftMax: 0.05,
  shardLifeMs: 1300,
} as const;

/** Układ (płótno 960×540). */
export const DEATH_LAYOUT = {
  centerX: 480,
  title: { centerY: 128, unit: 10, gap: 1, extrude: 3 },
  score: { y: 214, fontSize: 16 },
  ornament: { y: 248, width: 96, gap: 14 },
  header: { y: 272, fontSize: 13 },
  rows: { y: 298, step: 24, fontSize: 15 },
  prompt: { y: 448, fontSize: 15 },
  /** Ciemny pas pod tablicą dla czytelności — gra wciąż prześwituje. */
  band: { y: 196, height: 220, width: 520, alpha: 0.45 },
  vignetteAlpha: 0.75,
} as const;
