import { SPLASH_PALETTE } from '@/config/splashConfig';
import { DEATH_HERO_ICON } from '@/config/deathScreenConfig';
import { MenuEntry } from '@/systems/mainMenu';

/**
 * Menu główne (krok 91): układ i napisy. Menu leży na ekranie startowym — wieża, zaćmienie i popiół
 * zostają w tle, lewy panel to pozycje menu, prawy — opis zaznaczonej pozycji (zapis, tryb, sterowanie).
 */
export const MENU_PALETTE = {
  panel: SPLASH_PALETTE.chitin0,
  panelAlpha: 0.82,
  border: SPLASH_PALETTE.chitin3,
  /** Tekst (CSS). */
  item: '#d8ccb0',
  itemSelected: '#e7b140',
  itemDisabled: '#5d5448',
  title: '#f1e2a9',
  text: '#d8ccb0',
  textDim: '#9c8f74',
  warn: '#ed4b40',
  /** Cień tekstu wyników na środku menu (krok 94a, bez tła panelu). */
  textShadow: '#07060b',
  /** Własny wynik na tablicy ekranu startowego (krok 94). */
  own: '#e7b140',
  /** Areny bossów — fiolet teleportu, jak zakładka na ekranie wyboru. */
  arenaMode: '#c8a8ff',
  fade: SPLASH_PALETTE.chitin0,
} as const;

export const MENU_LAYOUT = {
  /** Lewy panel z pozycjami menu (z dala od wieży na środku i napisów TOP / DOWN). */
  menu: { x: 40, y: 150, width: 300, height: 252, padX: 22, firstItemY: 22, step: 34, fontSize: 17, letterSpacing: 2 },
  /**
   * Środkowe najlepsze wyniki (krok 94): wspinaczka i areny, między panelami menu i opisu.
   * Bez tła i ramki (krok 94a) — sam tekst z cieniem na tle wieży. Tytuły list na środku, wiersze wyników
   * wyśrodkowane jako blok z kolumną miniaturek bohaterów po lewej (krok 94b).
   */
  scores: {
    x: 354,
    y: 150,
    width: 252,
    padX: 8,
    padY: 12,
    fontSize: 11,
    lineStep: 18,
    sectionGap: 10,
    shadowBlur: 3,
    /** Miniaturka jak na ekranie śmierci (ten sam kadr), mniejsza, by mieściła się w wierszu. */
    icon: { facing: DEATH_HERO_ICON.facing, crop: DEATH_HERO_ICON.crop, sizePx: 16, gapPx: 4 },
  },
  /** Prawy panel z opisem. */
  info: { x: 620, y: 150, width: 300, height: 252, padX: 18, padY: 18, titleFontSize: 15, fontSize: 12, lineSpacing: 5 },
  hint: { y: 524, fontSize: 12, letterSpacing: 2 },
  /** Wejście menu i wyjście do gry (ms). */
  fadeInMs: 300,
  fadeOutMs: 260,
  borderWidth: 2,
} as const;

/** Nazwy pozycji menu. */
export const MENU_LABELS: Readonly<Record<MenuEntry, string>> = {
  [MenuEntry.Continue]: 'KONTYNUUJ',
  [MenuEntry.NewTower]: 'NOWA WSPINACZKA',
  [MenuEntry.BossRush]: 'ARENY BOSSÓW · TEST',
  [MenuEntry.FloorSelect]: 'WYBÓR PIĘTRA',
  [MenuEntry.Load]: 'WCZYTAJ GRĘ',
  [MenuEntry.Controls]: 'STEROWANIE',
};

/** Opisy w prawym panelu (Kontynuuj i Wczytaj opisują zapis, więc mają tylko tekst zastępczy). */
export const MENU_TEXT = {
  continueEmpty: 'Brak rozpoczętej wspinaczki.\nGra zapisuje się sama przy wejściu na każde piętro.',
  continueTitle: 'Rozpoczęta wspinaczka',
  continueNote: 'wracasz na początek piętra\nautozapis znika po śmierci',
  newTowerTitle: 'Wspinaczka',
  newTower: 'Piętra wieży, boss na końcu każdego.\nWynik = złoto w chwili śmierci.',
  bossRushTitle: 'Areny bossów',
  bossRush: 'Same areny bossów, nagroda co arenę.\nOsobna tablica wyników: najpierw arena, potem złoto.',
  floorSelectTitle: 'Wybór piętra',
  floorSelectLocked: 'Pokonaj bossa pierwszego piętra we wspinaczce, a odblokujesz start od dalszych pięter.',
  floorSelect: (best: string): string => `Nowy run od piętra, którego bossa już pokonałeś.\nNajdalej: ${best}.\nWynik nie trafia na tablicę.`,
  floorSelectNote: 'Start z pustymi rękami i pełnym życiem.\nWynik nie trafia na tablicę.',
  floorBack: 'WRÓĆ',
  loadTitle: 'Wczytaj grę',
  loadEmpty: 'Brak zapisów.\nZapisz grę w pauzie (Esc): klawisze 1, 2, 3.',
  load: 'Trzy sloty zapisu.\nZapis = stan z wejścia na piętro.',
  controlsTitle: 'Sterowanie',
  controls: [
    'WASD — ruch',
    'LPM / PPM — ataki bohatera',
    'Spacja — dash',
    'E — kapliczka, schody',
    'Esc / P — pauza i zapis gry',
    'F9 — raport błędów',
  ],
  slotBack: 'WRÓĆ',
  slotDeleteHint: 'X / DELETE — usuń zapis',
  slotDeleteConfirm: 'Naciśnij X ponownie, by usunąć',
  mainHint: '↑ ↓  WYBÓR   ·   ENTER — OK',
  subHint: '↑ ↓  WYBÓR   ·   ENTER — OK   ·   ESC — WRÓĆ',
  floorHint: '← →  PIĘTRO   ·   ENTER — DALEJ   ·   ESC — WRÓĆ',
} as const;

/** Tablica wyników na ekranie startowym (krok 94): ile wpisów na sekcję i napisy. */
export const MENU_SCORES = {
  topCount: 3,
  titles: {
    tower: { local: 'WSPINACZKA', pending: 'WSPINACZKA · ŁĄCZENIE…', shared: 'WSPINACZKA' },
    arenas: { local: 'ARENY BOSSÓW', pending: 'ARENY BOSSÓW · ŁĄCZENIE…', shared: 'ARENY BOSSÓW' },
  },
  text: {
    empty: '  brak wyników',
    ownPrefix: 'Ty: ',
    overtaken: (from: number, to: number | null): string =>
      to === null ? `▼ wyprzedzili cię: było ${from}. miejsce` : `▼ ktoś cię wyprzedził: ${from}. → ${to}.`,
  },
} as const;
