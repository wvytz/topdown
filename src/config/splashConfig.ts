/**
 * Ekran startowy (krok 34; od kroku 52 nowy motyw): TOP nad szczytem samotnej wieży, DOWN u jej podstawy.
 * Wokół mrok i zniszczenie, za wieżą zaćmione słońce, z nieba opada popiół — gra jako metafora końca.
 * Paleta z systemu „Matka Pająków” (chityna, ogień jaj, oczy, kość).
 */

/** Kolory (0xRRGGBB) — tokeny systemu „Matka Pająków” + czerń tarczy zaćmienia. */
export const SPLASH_PALETTE = {
  void: 0x07060b,
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

/** Dwie linie napisu: TOP nad wieżą, DOWN u jej stóp (środek w pikselach ekranu). */
export const SPLASH_TITLE_LINES = [
  { text: 'TOP', centerY: 76 },
  { text: 'DOWN', centerY: 448 },
] as const;

/** Oś czasu w ms od startu sceny. Całość ok. 4,3 s; tytuł trzyma się dłużej, jeśli gra jeszcze się ładuje. */
export const SPLASH_TIMING = {
  /** Wieża powoli wyłania się z ciemności. */
  revealAt: 300,
  revealDuration: 900,
  /** Korona zaćmionego słońca rozżarza się za wieżą. */
  coronaAt: 200,
  coronaDuration: 1400,
  /** Uderzenia linii napisu: TOP, potem cięższe DOWN. */
  wordSlamAt: [900, 1500],
  slamDuration: 200,
  slamFromScale: 2.4,
  slamUndershoot: 0.93,
  slamOvershoot: 1.04,
  settleDuration: 180,
  /** Błysk i wstrząs każdego uderzenia (ostatnie najcięższe). */
  flashAlpha: [0.3, 0.5],
  flashDuration: 400,
  shakeDuration: [260, 520],
  shakeIntensity: [0.006, 0.014],
  /** Po uderzeniu DOWN pęknięcia w ziemi zaczynają się żarzyć. */
  cracksDuration: 500,
  /** Oczy w mroku: zapalają się i co jakiś czas mrugają. */
  eyesAt: 2000,
  lateEyesDelay: 500,
  blinkPeriod: 2200,
  blinkOffset: 900,
  blinkLength: 120,
  /** Wygaszenie do czerni i start pierwszej planszy. */
  fadeOutAt: 3700,
  fadeOutDuration: 600,
} as const;

export type SplashTiming = typeof SPLASH_TIMING;

/** Układ i efekty w pikselach ekranu (płótno 960×540). */
export const SPLASH_LAYOUT = {
  /** Jeden piksel tła = 4 piksele ekranu (siatka 240×135); detale (oczy) w siatce 480×270. */
  artScale: 4,
  detailScale: 2,
  centerX: 480,
  title: { unit: 14, gap: 1, extrude: 4 },
  /** Zaćmione słońce za szczytem wieży (siatka 240×135). */
  eclipse: { cx: 120, cy: 50, radius: 15 },
  glow: { size: 300, alpha: 0.32 },
  /** Popiół opada powoli i kołysze się na boki. */
  ash: { count: 46, minSpeed: 0.012, maxSpeed: 0.035, sway: 10, swayPeriodMs: 3200 },
  /** Kamienie odpadające od wyrwy w wieży: przy każdym uderzeniu i pojedynczo co jakiś czas. */
  debris: { perImpact: [3, 6], dribbleMs: 650, gravity: 0.0009, groundY: 464, minSize: 2, maxSize: 3 },
  /** Pył przy uderzeniu DOWN w ziemię. */
  dust: { count: 26, y: 470, speed: 0.12, lifeMs: 900 },
  vignetteAlpha: 0.95,
  scanlineAlpha: 0.22,
} as const;

/** Lico liter: popiół i kość, od jasnej góry do ciemniejszej podstawy; pod spodem żarząca się krawędź. */
export const SPLASH_TITLE_BANDS = [
  SPLASH_PALETTE.bone2,
  SPLASH_PALETTE.bone2,
  SPLASH_PALETTE.bone1,
  SPLASH_PALETTE.bone1,
  SPLASH_PALETTE.bone1,
  SPLASH_PALETTE.bone0,
  SPLASH_PALETTE.bone0,
] as const;

/** Prostokąt rysunku: x, y, szerokość, wysokość (w siatce warstwy), kolor. */
export type ArtRect = readonly [number, number, number, number, number];
/** Odcinek w siatce 240×135. */
export type ArtLine = readonly [number, number, number, number];

const P = SPLASH_PALETTE;
const GROUND = 118;

/** Wyszczerbiony szczyt wieży: kolumny [x, wierzch, szerokość] do linii ziemi (prawa strona utrącona niżej). */
const TOWER_COLUMNS: readonly (readonly [number, number, number])[] = [
  [104, 56, 4], [108, 50, 3], [111, 53, 4], [115, 44, 3], [118, 40, 4],
  [122, 46, 3], [125, 51, 4], [129, 59, 4], [133, 66, 3],
];

/** Samotna wieża i spękana ziemia wokół (siatka 240×135, kolejność rysowania). */
export const SPLASH_BACKDROP: readonly ArtRect[] = [
  // ziemia: nierówny horyzont, dalej tylko ciemność
  [0, 116, 240, 19, P.outline], [0, 114, 40, 2, P.outline], [70, 115, 30, 1, P.outline],
  [150, 114, 20, 2, P.outline], [200, 113, 40, 3, P.outline],
  // dalekie zwały gruzu
  [8, 111, 18, 5, P.chitin1], [214, 110, 20, 6, P.chitin1],
  // zniszczenie po bokach: kikuty kolumn, przechylone resztki murów, złamany łuk
  [30, 100, 6, 16, P.chitin1], [32, 94, 6, 6, P.chitin1], [34, 90, 5, 4, P.chitin1], [30, 100, 1, 16, P.chitin2],
  [44, 96, 10, 20, P.chitin1], [46, 90, 6, 6, P.chitin1], [49, 86, 3, 4, P.chitin1], [44, 96, 1, 20, P.chitin2],
  [12, 106, 14, 3, P.chitin1], [12, 109, 3, 7, P.chitin1], [12, 106, 14, 1, P.chitin2],
  [196, 98, 7, 18, P.chitin1], [198, 92, 6, 6, P.chitin1], [196, 98, 1, 18, P.chitin2],
  [180, 100, 9, 16, P.chitin1], [182, 95, 4, 5, P.chitin1], [180, 100, 1, 16, P.chitin2],
  [214, 104, 16, 3, P.chitin1], [226, 107, 3, 9, P.chitin1], [214, 104, 16, 1, P.chitin2],
  // wieża
  ...TOWER_COLUMNS.map(([x, top, w]) => [x, top, w, GROUND - top, P.chitin1] as const),
  [104, 56, 2, GROUND - 56, P.chitin2], [115, 44, 1, 8, P.chitin2],
  // warstwy kamieni
  [106, 72, 30, 1, P.outline], [106, 84, 30, 1, P.outline], [106, 96, 30, 1, P.outline], [106, 108, 30, 1, P.outline],
  [112, 72, 1, 12, P.outline], [127, 72, 1, 12, P.outline], [119, 84, 1, 12, P.outline],
  [109, 96, 1, 12, P.outline], [130, 96, 1, 12, P.outline],
  // wyrwa w prawym boku — prześwituje niebo
  [131, 70, 5, 9, P.chitin0], [129, 74, 2, 4, P.chitin0], [134, 79, 2, 3, P.chitin0],
  // ostatnie okno ze światłem i ciemne szczeliny
  [117, 69, 4, 8, P.chitin0], [118, 72, 2, 4, P.egg1], [118, 71, 2, 1, P.egg0],
  [110, 86, 2, 6, P.chitin0], [127, 90, 2, 6, P.chitin0],
  // brama i podstawa
  [98, 108, 44, 10, P.chitin1], [98, 108, 44, 1, P.chitin2], [98, 108, 2, 10, P.chitin2],
  [116, 102, 8, 2, P.chitin0], [114, 104, 12, 14, P.chitin0],
  // odłamy muru na ziemi
  [150, 110, 14, 6, P.chitin1], [152, 108, 8, 2, P.chitin1], [150, 110, 14, 1, P.chitin2],
  [80, 112, 9, 4, P.chitin1], [80, 112, 9, 1, P.chitin2], [70, 114, 5, 2, P.chitin1],
  [170, 113, 4, 3, P.chitin1], [62, 115, 3, 1, P.chitin1],
];

/** Pęknięcie przez mur wieży (siatka 240×135). */
export const SPLASH_TOWER_CRACKS: readonly ArtLine[] = [
  [124, 48, 121, 70],
  [121, 70, 125, 95],
  [125, 95, 123, 106],
];

/** Pęknięcia w ziemi rozchodzące się od podstawy wieży — żarzą się po uderzeniu DOWN. */
export const SPLASH_GROUND_CRACKS: readonly ArtLine[] = [
  [104, 119, 60, 134],
  [136, 119, 178, 134],
  [92, 121, 70, 125],
  [150, 121, 192, 127],
  [60, 134, 40, 128],
  [178, 134, 214, 129],
];

/** Wyrwa, z której odpadają kamienie (siatka 240×135): x od–do, y od–do. */
export const SPLASH_DEBRIS_SOURCE = { x0: 128, x1: 137, y0: 60, y1: 82 } as const;

/** Oczy w mroku (siatka 480×270): po bokach przy ziemi i w bramie wieży. */
export const SPLASH_EYES: readonly ArtRect[] = [
  [235, 218, 2, 2, P.eye1], [243, 218, 2, 2, P.eye1], [236, 218, 1, 1, P.eye2], [244, 218, 1, 1, P.eye2],
  [70, 214, 1, 1, P.eye1], [74, 214, 1, 1, P.eye1],
];

/** Oczy, które zapalają się chwilę później — dalej w ciemności. */
export const SPLASH_EYES_LATE: readonly ArtRect[] = [
  [404, 206, 1, 1, P.eye1], [408, 206, 1, 1, P.eye1],
  [150, 226, 1, 1, P.eye0], [153, 226, 1, 1, P.eye0],
  [340, 222, 1, 1, P.eye0], [343, 222, 1, 1, P.eye0],
];

/** Odległe pożary na horyzoncie (siatka 480×270): świat płonie gdzieś w mroku. */
export const SPLASH_FIRES: readonly ArtRect[] = [
  [22, 220, 2, 2, P.egg1], [22, 219, 1, 1, P.egg2],
  [58, 226, 2, 1, P.egg0],
  [452, 214, 2, 2, P.egg1], [453, 213, 1, 1, P.egg2],
  [418, 222, 2, 1, P.egg0],
];

/** Kolory popiołu (drobne, przygaszone). */
export const SPLASH_ASH_COLORS = [P.bone0, P.chitin3, P.chitin2] as const;
