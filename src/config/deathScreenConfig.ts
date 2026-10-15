/**
 * Ekran śmierci (krok 35; od kroku 38 w tonie ekranu TOP / DOWN): przyciemniona gra pod spodem,
 * napis POLEGŁEŚ z popiołu, który się wypala i osypuje, opadający popiół i małe zaćmione słońce;
 * na środku wynik i tablica rekordów.
 */
import { SPLASH_PALETTE, SPLASH_TITLE_BANDS } from '@/config/splashConfig';

export const DEATH_PALETTE = SPLASH_PALETTE;

/** Lico liter jak TOP / DOWN: popiół i kość (akcent Ś ma kolor wiersza 0). */
export const DEATH_TITLE_BANDS = SPLASH_TITLE_BANDS;

/** Kawałek litery przed odpadnięciem rozżarza się (wypala), potem opada jako popiół. */
export const DEATH_EMBER_COLOR = DEATH_PALETTE.egg0;

/** Kolory popiołu i pyłu (losowane wizualnie). */
export const DEATH_ASH_COLORS = [DEATH_PALETTE.bone0, DEATH_PALETTE.chitin3, DEATH_PALETTE.chitin2] as const;

/** Oś czasu w ms od chwili śmierci. */
export const DEATH_TIMING = {
  /** Przyciemnienie gry narasta do `dimAlpha` — gra pod spodem dalej jest widoczna. */
  dimDuration: 600,
  dimAlpha: 0.62,
  /** Uderzenie POLEGŁEŚ (jak TOP / DOWN na ekranie startowym). */
  slamAt: 250,
  slamDuration: 180,
  slamFromScale: 2.2,
  slamUndershoot: 0.94,
  slamOvershoot: 1.04,
  settleDuration: 160,
  flashAlpha: 0.3,
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
  /** Strużki popiołu sypiące się z dolnych krawędzi liter. */
  dripCount: 7,
  dripMinPeriodMs: 1400,
  dripMaxPeriodMs: 2800,
} as const;

export type DeathCrumbleConfig = typeof DEATH_CRUMBLE;

/** Fizyka popiołu i odłamków (piksele ekranu, ms). */
export const DEATH_PARTICLES = {
  gravity: 0.0012,
  /** Chmura pyłu przy uderzeniu napisu (pył spada wolniej niż odłamki). */
  burstCount: 40,
  burstSpeedMin: 0.08,
  burstSpeedMax: 0.32,
  burstLifeMs: 1500,
  burstGravityScale: 0.35,
  /** Strużka popiołu z dolnej krawędzi litery: zbiera się chwilę, potem opada. */
  dripSwellMs: 450,
  dripLifeMs: 1400,
  dripGravityScale: 0.25,
  /** Odłamki liter: lekki dryf w bok, gaśnięcie. */
  shardDriftMax: 0.05,
  shardLifeMs: 1300,
  /** Popiół opadający nad całą sceną (jak na ekranie startowym). */
  ashCount: 40,
  ashMinSpeed: 0.012,
  ashMaxSpeed: 0.035,
  ashSway: 10,
  ashSwayPeriodMs: 3200,
} as const;

/** Układ (płótno 960×540). */
export const DEATH_LAYOUT = {
  centerX: 480,
  title: { centerY: 128, unit: 10, gap: 1, extrude: 3 },
  score: { y: 214, fontSize: 16 },
  /** Ozdobnik: belki i małe zaćmione słońce pośrodku (promień w pikselach ozdobnika, piksel = 2 px). */
  ornament: { y: 248, width: 96, gap: 22, eclipseRadius: 5, pixel: 2 },
  header: { y: 272, fontSize: 13 },
  rows: { y: 298, step: 24, fontSize: 15 },
  prompt: { y: 448, fontSize: 15 },
  /** Ciemny pas pod tablicą dla czytelności — gra wciąż prześwituje. */
  band: { y: 196, height: 220, width: 520, alpha: 0.45 },
  vignetteAlpha: 0.75,
} as const;
