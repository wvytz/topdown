/**
 * Ekran startowy (krok 34, „epicka” wersja z nazwą TOP DOWN w kroku 36): czasy, układ, paleta i rysunek tła.
 * Paleta z systemu „Matka Pająków” (chityna, ogień jaj, oczy, kość); projekt na kanwie Claude Design.
 */

/** Kolory (0xRRGGBB) — tokeny systemu „Matka Pająków”. */
export const SPLASH_PALETTE = {
  outline: 0x1b1a22,
  chitin0: 0x0f0e18,
  chitin1: 0x241823,
  chitin2: 0x3c272a,
  chitin3: 0x573e38,
  egg0: 0xa03317,
  egg1: 0xd36c00,
  egg2: 0xe7b140,
  egg3: 0xf1e2a9,
  eye0: 0xb02a2d,
  eye1: 0xed4b40,
  eye2: 0xf4c7a3,
  bone0: 0x9c8f74,
  bone1: 0xd8ccb0,
  bone2: 0xe8e0c0,
} as const;

/** Napis na ekranie startowym: nazwa gry, słowa uderzają po kolei (krok 36). */
export const SPLASH_TITLE_WORDS = ['TOP', 'DOWN'] as const;

/**
 * Oś czasu w ms od startu sceny (krok 36: wersja „epicka”). Całość ok. 3,9 s;
 * tytuł trzyma się dłużej, jeśli gra jeszcze się ładuje.
 */
export const SPLASH_TIMING = {
  /** Błyski pioruna w ciemności — na moment wydobywają sylwetkę wieży. */
  lightningAt: [150, 330],
  lightningPeak: [0.85, 0.55],
  lightningDecay: 170,
  /** Wyjście tła z czerni po piorunach. */
  backdropAt: 500,
  backdropIn: 450,
  /** Uderzenia słów (TOP, potem mocniej DOWN). */
  wordSlamAt: [700, 1050],
  /** Lot słowa ze skali `slamFromScale` do `slamUndershoot`. */
  slamDuration: 180,
  slamFromScale: 3,
  slamUndershoot: 0.92,
  slamOvershoot: 1.05,
  /** Odbicie po uderzeniu: undershoot → overshoot → 1. */
  settleDuration: 180,
  /** Błysk i wstrząs każdego uderzenia (ostatnie najmocniejsze). */
  flashAlpha: [0.5, 0.85],
  flashDuration: 350,
  shakeDuration: [200, 420],
  shakeIntensity: [0.005, 0.013],
  /** Promienie światła zza ruin rozjaśniają się po ostatnim uderzeniu. */
  raysFadeIn: 700,
  /** Rozgrzany połysk przesuwa się po literach. */
  shineAt: 1500,
  shineDuration: 650,
  /** Oczy w ruinach: zapalają się i co jakiś czas mrugają. */
  eyesAt: 1700,
  /** Druga grupa oczu zapala się później. */
  lateEyesDelay: 600,
  blinkPeriod: 2200,
  blinkOffset: 900,
  blinkLength: 120,
  /** Wpisywanie podtytułu znak po znaku. */
  subtitleAt: 2000,
  subtitleCharMs: 28,
  /** Wygaszenie do czerni i start pierwszej planszy. */
  fadeOutAt: 3400,
  fadeOutDuration: 500,
} as const;

export type SplashTiming = typeof SPLASH_TIMING;

/** Układ w pikselach ekranu (płótno 960×540). */
export const SPLASH_LAYOUT = {
  /** Jeden piksel tła = 4 piksele ekranu (siatka 240×135); detale (oczy, worki) w siatce 480×270. */
  artScale: 4,
  detailScale: 2,
  centerX: 480,
  title: { centerY: 238, unit: 16, gap: 1, extrude: 4 },
  /** Połysk: ukośny pas w pikselach fontu (szerokość, pochylenie na wiersz). */
  shine: { width: 2.5, slant: 0.5 },
  ornament: { y: 330, width: 120, gap: 18 },
  subtitle: { y: 368, fontSize: 14, letterSpacing: 6 },
  glow: { width: 760, height: 340, alpha: 0.42 },
  /** Promienie światła z punktu za tytułem. */
  rays: { count: 14, size: 1100, alpha: 0.13, spinDegPerSec: 3 },
  /** Piorun ma chłodny, kościany kolor — tylko na moment. */
  lightningColor: 0xe8e0c0,
  vignetteAlpha: 0.92,
  scanlineAlpha: 0.28,
  embers: { count: 20, minDurationMs: 3200, maxDurationMs: 6000, risePx: 380 },
  spiderDangle: { px: 6, periodMs: 4000, steps: 6 },
  primeBlinkMs: 400,
} as const;

/** Pasy ognia w wierszach liter (7 wierszy fontu): od blasku do bazy. */
export const SPLASH_TITLE_BANDS = [
  SPLASH_PALETTE.egg3,
  SPLASH_PALETTE.egg3,
  SPLASH_PALETTE.egg2,
  SPLASH_PALETTE.egg2,
  SPLASH_PALETTE.egg1,
  SPLASH_PALETTE.egg1,
  SPLASH_PALETTE.egg1,
] as const;

/** Prostokąt rysunku: x, y, szerokość, wysokość (w siatce warstwy), kolor. */
export type ArtRect = readonly [number, number, number, number, number];
/** Prostokąt bez koloru: x, y, szerokość, wysokość. */
export type ArtBox = readonly [number, number, number, number];
/** Odcinek pajęczyny w siatce 240×135. */
export type ArtLine = readonly [number, number, number, number];

const P = SPLASH_PALETTE;

/** Pajęczyny w górnych rogach (siatka 240×135). */
export const SPLASH_WEBS: readonly ArtLine[] = [
  [0, 0, 40, 26], [0, 0, 22, 40], [0, 0, 46, 8], [12, 0, 0, 10], [26, 2, 4, 20], [36, 20, 14, 32],
  [239, 0, 204, 22], [239, 0, 222, 34], [239, 0, 196, 6], [228, 0, 239, 10], [212, 4, 236, 18],
];

/** Nieruchome tło: dalekie mury, wieża, ruiny, gruz (siatka 240×135, kolejność rysowania). */
export const SPLASH_BACKDROP: readonly ArtRect[] = [
  // dalekie zarysy murów
  [0, 100, 20, 35, P.outline], [20, 92, 14, 43, P.outline], [34, 98, 18, 37, P.outline],
  [52, 86, 6, 49, P.outline], [58, 90, 12, 45, P.outline], [70, 96, 14, 39, P.outline],
  [222, 104, 18, 31, P.outline], [210, 94, 12, 41, P.outline], [196, 99, 14, 36, P.outline],
  [188, 88, 8, 47, P.outline], [176, 93, 12, 42, P.outline], [160, 100, 16, 35, P.outline],
  // wieża z wyszczerbionym szczytem
  [96, 44, 3, 91, P.chitin1], [99, 40, 4, 95, P.chitin1], [103, 44, 3, 91, P.chitin1],
  [106, 38, 4, 97, P.chitin1], [110, 42, 4, 93, P.chitin1], [114, 34, 4, 101, P.chitin1],
  [118, 28, 3, 107, P.chitin1], [121, 33, 3, 102, P.chitin1], [124, 41, 4, 94, P.chitin1],
  [128, 45, 3, 90, P.chitin1], [131, 39, 4, 96, P.chitin1], [135, 46, 4, 89, P.chitin1],
  [139, 52, 3, 83, P.chitin1], [142, 48, 2, 87, P.chitin1],
  [96, 44, 2, 91, P.chitin2], [114, 34, 1, 8, P.chitin2],
  // warstwy kamieni i spoiny
  [98, 58, 46, 1, P.outline], [98, 70, 46, 1, P.outline], [98, 82, 46, 1, P.outline],
  [98, 94, 46, 1, P.outline], [98, 106, 46, 1, P.outline],
  [108, 58, 1, 12, P.outline], [126, 58, 1, 12, P.outline], [116, 70, 1, 12, P.outline],
  [134, 70, 1, 12, P.outline], [104, 82, 1, 12, P.outline], [122, 82, 1, 12, P.outline],
  [112, 94, 1, 12, P.outline], [130, 94, 1, 12, P.outline],
  // pęknięcie
  [128, 46, 1, 6, P.chitin0], [127, 52, 1, 6, P.chitin0], [128, 58, 1, 5, P.chitin0],
  // okno z pochodnią i ciemne okno
  [104, 96, 4, 9, P.chitin0], [105, 99, 2, 5, P.egg1], [105, 98, 2, 1, P.egg0],
  [134, 98, 3, 7, P.chitin0],
  // podstawa i brama
  [88, 120, 62, 15, P.chitin1], [88, 120, 62, 1, P.chitin2], [88, 120, 2, 15, P.chitin2],
  [114, 110, 12, 2, P.chitin0], [112, 112, 16, 23, P.chitin0],
  // lewa złamana kolumna z łukiem
  [22, 68, 2, 67, P.chitin1], [24, 64, 2, 71, P.chitin1], [26, 58, 6, 77, P.chitin1],
  [32, 64, 4, 71, P.chitin1], [36, 64, 2, 4, P.chitin1],
  [24, 68, 2, 67, P.chitin2], [22, 64, 16, 1, P.chitin2],
  [36, 70, 14, 4, P.chitin1], [50, 74, 6, 3, P.chitin1],
  [58, 96, 10, 39, P.chitin1], [58, 96, 2, 39, P.chitin2],
  // prawy mur z oknem
  [196, 60, 4, 75, P.chitin1], [200, 54, 6, 81, P.chitin1], [206, 62, 4, 73, P.chitin1],
  [210, 57, 6, 78, P.chitin1], [196, 60, 2, 75, P.chitin2], [202, 76, 6, 10, P.chitin0],
  [176, 100, 8, 35, P.chitin1], [176, 100, 2, 35, P.chitin2],
  // gruz
  [0, 128, 240, 7, P.outline],
  [8, 125, 6, 3, P.chitin1], [8, 125, 6, 1, P.chitin2], [16, 127, 4, 2, P.chitin1],
  [72, 126, 8, 3, P.chitin1], [72, 126, 8, 1, P.chitin2],
  [152, 126, 7, 3, P.chitin1], [160, 124, 4, 4, P.chitin1], [160, 124, 4, 1, P.chitin2],
  [222, 126, 9, 3, P.chitin1], [222, 126, 9, 1, P.chitin2], [232, 127, 5, 2, P.chitin1],
  // pajączki na gruzie
  [66, 121, 5, 3, P.chitin0], [64, 120, 1, 1, P.chitin0], [72, 120, 1, 1, P.chitin0],
  [64, 124, 1, 1, P.chitin0], [72, 124, 1, 1, P.chitin0],
  [168, 122, 5, 3, P.chitin0], [166, 121, 1, 1, P.chitin0], [174, 121, 1, 1, P.chitin0],
  [166, 125, 1, 1, P.chitin0], [174, 125, 1, 1, P.chitin0],
];

/** Pająk na nitce (siatka 240×135) — kołysze się w górę i w dół. */
export const SPLASH_SPIDER: readonly ArtRect[] = [
  [46, 0, 1, 40, P.chitin2],
  [44, 40, 5, 4, P.chitin1], [43, 44, 7, 6, P.chitin1], [45, 45, 2, 1, P.chitin2],
  [40, 41, 4, 1, P.chitin1], [49, 41, 4, 1, P.chitin1], [39, 42, 1, 3, P.chitin1], [53, 42, 1, 3, P.chitin1],
  [40, 45, 3, 1, P.chitin1], [50, 45, 3, 1, P.chitin1], [39, 46, 1, 3, P.chitin1], [53, 46, 1, 3, P.chitin1],
];

/** Nietoperz w prawym górnym rogu (siatka 240×135). */
export const SPLASH_BAT: readonly ArtRect[] = [
  [180, 24, 4, 3, P.chitin1], [174, 22, 6, 2, P.chitin1], [184, 22, 6, 2, P.chitin1],
  [172, 21, 2, 2, P.chitin1], [190, 21, 2, 2, P.chitin1], [176, 24, 2, 1, P.chitin1], [186, 24, 2, 1, P.chitin1],
];

/** Oczy pająka na nitce (siatka 480×270, przesuwają się razem z nim). */
export const SPLASH_SPIDER_EYES: readonly ArtRect[] = [
  [91, 94, 1, 1, P.eye1], [94, 94, 1, 1, P.eye1],
];

/** Oczy w mroku (siatka 480×270): Matka w bramie wieży i pierwsza grupa. */
export const SPLASH_EYES: readonly ArtRect[] = [
  [231, 240, 2, 1, P.eye0], [235, 238, 2, 2, P.eye1], [243, 238, 2, 2, P.eye1], [247, 240, 2, 1, P.eye0],
  [236, 238, 1, 1, P.eye2], [244, 238, 1, 1, P.eye2],
];

/** Oczy, które zapalają się chwilę później: okno muru, ciemne okno wieży, pajączek. */
export const SPLASH_EYES_LATE: readonly ArtRect[] = [
  [407, 160, 2, 1, P.eye1], [412, 160, 2, 1, P.eye1],
  [269, 202, 1, 1, P.eye1], [272, 202, 1, 1, P.eye1],
  [133, 243, 1, 1, P.eye1], [139, 243, 1, 1, P.eye1],
];

/** Worki-bomby pajączków (siatka 480×270) — pulsują między egg0 a egg2. */
export const SPLASH_SACS: readonly ArtBox[] = [
  [135, 242, 2, 2],
  [339, 244, 2, 2],
];

/** Kolory iskier unoszących się z dołu. */
export const SPLASH_EMBER_COLORS = [P.egg0, P.egg1, P.egg2, P.egg3] as const;
