/**
 * Ekran śmierci (krok 35; od kroku 63 w stylu Dark Souls / Castlevanii): gra powoli tonie w ciemności,
 * przez środek ekranu czarny pas, a na nim POLEGŁEŚ w przygaszonej czerwieni — pojawia się powoli
 * i bardzo wolno rośnie. Bez krwi, wstrząsów i cząstek. Pod spodem wynik i tablica rekordów.
 */
import { SPLASH_PALETTE } from '@/config/splashConfig';

/** Głęboka, przygaszona czerwień + zakrzepłe tony. */
export const DEATH_PALETTE = {
  ...SPLASH_PALETTE,
  blood0: 0x3e0f14,
  blood1: 0x6e1a1f,
  blood2: 0x8c1f24,
} as const;

/** Grupa liter spływająca we własnym tempie. */
export interface DeathFlowGroup {
  readonly letters: number;
  readonly speedPxPerSec: number;
  readonly offsetPx: number;
}

/**
 * Lico liter POLEGŁEŚ (krok 64): pasy czerwieni spływają w dół przez litery, bez końca.
 * Rampa jest cykliczna (zaczyna się i kończy podobnym tonem), więc pętla nie ma szwu;
 * jeden cykl = `ramp.length × bandPx` pikseli ekranu.
 */
export const DEATH_TITLE_FLOW = {
  ramp: [
    DEATH_PALETTE.eye1,
    DEATH_PALETTE.eye0,
    DEATH_PALETTE.eye0,
    DEATH_PALETTE.blood2,
    DEATH_PALETTE.blood1,
    DEATH_PALETTE.blood1,
    DEATH_PALETTE.blood2,
    DEATH_PALETTE.eye0,
  ],
  /** Wysokość jednego tonu rampy (px ekranu). */
  bandPx: 8,
  /** Lico rysujemy paskami tej wysokości — kolor zmienia się skokowo, po pikselowemu. */
  stripPx: 2,
  /** Prędkość spływania (px/s) — dla grup bez własnej prędkości. */
  speedPxPerSec: 18,
  /**
   * Grupy liter (od lewej) spływają każda w swoim tempie i z innym przesunięciem — krew nie cieknie równo.
   * POLEGŁEŚ: PO | LEG | ŁEŚ. Suma `letters` musi pokryć napis.
   */
  groups: [
    { letters: 2, speedPxPerSec: 13, offsetPx: 0 },
    { letters: 3, speedPxPerSec: 24, offsetPx: 27 },
    { letters: 3, speedPxPerSec: 17, offsetPx: 46 },
  ] as readonly DeathFlowGroup[],
} as const;

export type DeathTitleFlow = typeof DEATH_TITLE_FLOW;

/** Oś czasu w ms od chwili śmierci — wszystko powoli, bez uderzeń. */
export const DEATH_TIMING = {
  /** Gra tonie w ciemności. */
  dimDuration: 1500,
  dimAlpha: 0.85,
  /** Czarny pas przez środek ekranu. */
  bandAt: 300,
  bandDuration: 1200,
  /** Napis wyłania się powoli… */
  titleAt: 600,
  titleFadeDuration: 1600,
  /** …i przez kilka sekund bardzo wolno rośnie. */
  titleGrowDuration: 5000,
  titleFromScale: 1,
  titleToScale: 1.1,
  /** Wynik i tablica dopiero po napisie. */
  scoreAt: 2600,
  scoreFadeDuration: 600,
  rowsAt: 3000,
  rowInterval: 150,
  rowFadeDuration: 300,
  /** „R — nowa wspinaczka” wolno pulsuje. */
  promptAt: 3800,
  promptFadeDuration: 500,
  promptPulsePeriod: 2400,
  promptMinAlpha: 0.35,
} as const;

export type DeathTiming = typeof DEATH_TIMING;

/** Układ (płótno 960×540). */
export const DEATH_LAYOUT = {
  centerX: 480,
  /** Litery szeroko rozstawione (gap 2) — spokojny, ciężki napis. */
  title: { centerY: 196, unit: 8, gap: 2, outline: 2 },
  /**
   * Pas: pełna szerokość ekranu. Pełna czerń zaczyna się tuż pod HUD-em (od kroku 67 rząd ikon przedmiotów
   * kończy się na y = 147, pod paskiem promienia Czarodziejki; nad nią krótkie rozmycie), a w dół sięga o połowę dalej niż w kroku 63 (dół 271 → 346).
   */
  band: { top: 135, bottom: 346, fadeTopPx: 12, fadeBottomPx: 46, alpha: 0.85 },
  glow: { width: 620, height: 150, alpha: 0.3 },
  score: { y: 296, fontSize: 15 },
  /** Gotycki ozdobnik: cienkie linie i mały krzyż pośrodku. */
  ornament: { y: 326, width: 130, gap: 14 },
  header: { y: 342, fontSize: 12 },
  /** Krok 89: 7 wierszy (podium 5 + separator + bieżący run) — gęściej i drobniej niż przy podium 3 (krok 22 px, 14 px). */
  rows: { y: 362, step: 18, fontSize: 13 },
  prompt: { y: 502, fontSize: 14 },
  vignetteAlpha: 0.9,
} as const;

/**
 * Miniaturka bohatera przy wpisie na tablicy (krok 89a, prośba właściciela: ikona zamiast nazwy):
 * pierwsza klatka chodu z arkusza bohatera, zwrócona w dół, zmniejszona i wygładzona do kwadratu `sizePx`.
 * Miniaturki stoją w jednej kolumnie po lewej stronie tablicy (przed najszerszym wierszem). Są trochę wyższe od wiersza,
 * ale postać nie wypełnia klatki, więc sąsiednie się nie stykają. Wpis bez bohatera (sprzed kroku 89) albo z nieznanym bohaterem zostaje bez ikony.
 */
export const DEATH_HERO_ICON = {
  /** Kierunek w arkuszu (4 = w dół, jak na ekranie wyboru). */
  facing: 4,
  /** Kadr postaci w klatce 48×48 (wspólny dla bohaterów, z zapasem na broń). */
  crop: { x: 8, y: 10, size: 32 },
  sizePx: 22,
  gapPx: 8,
} as const;
