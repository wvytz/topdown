import { SPLASH_PALETTE } from '@/config/splashConfig';

/**
 * Interfejs 2.0 (krok U7): jeden pikselowy krój pisma (`core/pixelFont.ts`), ramki i paski w całkowitej skali
 * pikseli, barwy z ekranu startowego (popiół, czerń, czerwień, złoto). STYLEGUIDE §13.10.
 */
export const UI_PALETTE = {
  /** Obrys liter i ramek — ten sam co obrys postaci i łupów. */
  ink: SPLASH_PALETTE.outline,
  void: SPLASH_PALETTE.void,
  /** Tło paneli i slotów. */
  panel: SPLASH_PALETTE.chitin0,
  panelAlpha: 0.86,
  /** Jaśniejsza górna krawędź panelu (fazka). */
  panelLight: SPLASH_PALETTE.chitin2,
  /** Ramka panelu. */
  edge: SPLASH_PALETTE.chitin3,
  gold: SPLASH_PALETTE.egg2,
  goldLight: SPLASH_PALETTE.egg3,
  goldDark: 0x9a7424,
  bone: SPLASH_PALETTE.bone0,
  boneLight: SPLASH_PALETTE.bone1,
  red: SPLASH_PALETTE.eye0,
  redLight: SPLASH_PALETTE.eye1,
} as const;

/** Barwy napisów (CSS) — każda barwa to osobna tekstura fontu, więc trzymamy krótką listę. */
export const UI_TEXT_COLORS = {
  text: '#d8ccb0',
  bright: '#f1e2a9',
  dim: '#9c8f74',
  muted: '#5d5448',
  gold: '#e7b140',
  red: '#ed4b40',
  ok: '#9be08a',
  magic: '#d8c0ff',
  boss: '#f4c7a3',
  blue: '#8fc8f0',
} as const;

/**
 * Wielkości napisów = całkowita skala pikseli fontu (1 piksel fontu = N pikseli płótna 960×540).
 * Wersaliki mają 7 pikseli fontu: drobny napis 7 px, zwykły 14 px, tytuł 21 px.
 */
export type UiTextSize = 1 | 2 | 3 | 4 | 5 | 6 | 8;

/**
 * Nowy HUD (krok U7): lewy górny panel bohatera (portret, paski, ultimate, złoto, przedmioty), minimapa w ramce
 * w prawym górnym rogu, pasek bossa na dole. Napisy pomocy i długie podpowiedzi celu znikają po chwili.
 */
export const HUD_LAYOUT = {
  margin: 8,
  /** Ramka portretu bohatera (miniaturka jak na ekranie śmierci). */
  portrait: { size: 36, icon: 32 },
  /** Paski: HP z liczbą w środku, pod nim dash, ładunki strzału i promień Czarodziejki. */
  hp: { width: 196, height: 12 },
  dash: { height: 3 },
  charges: { height: 4, gap: 2 },
  beam: { height: 3 },
  barGap: 2,
  ultimate: { size: 22 },
  /** Złoto i cel pod paskami. */
  goldGap: 6,
  itemSlot: { size: 24, gap: 3 },
  /** Ile ms po zmianie celu widać pełną podpowiedź („znajdź komnatę bossa…”), potem zostaje skrót. */
  objectiveLongMs: 6000,
  /** Opis modyfikatora piętra: pełny przez tyle ms od wejścia na piętro, potem sama nazwa. */
  modifierLongMs: 9000,
  /** Linia sterowania na dole: tylko na początku runu (STYLEGUIDE §13.10). */
  helpVisibleMs: 25000,
  helpFadeMs: 1500,
  /** Pasek bossa (płótno 960×540). */
  bossBar: { width: 420, height: 10, y: 474, duetGap: 20 },
  /** Panel partnera w co-opie: prawy dolny róg. */
  partner: { width: 150, right: 12, topFromBottom: 108, hpHeight: 8, ultSize: 14, itemSize: 18, itemGap: 2 },
} as const;

/** Karty nagrody za bossa (krok U7): ramki w pikselach, ikony rodzaju przedmiotu, kropki postępu jako romby. */
export const REWARD_CARD = {
  width: 210,
  height: 292,
  gap: 28,
  /** Ikona przedmiotu w całkowitej skali (§6c). */
  iconScale: 3,
} as const;

/**
 * Wygląd liter (krok U7a, ocena właściciela: „zero głębi i odróżnienia od całości ekranu; wyraźna acz dyskretna
 * z wyraźną manifestacją”). Lico z rampą (jaśniejszy wierzch, ciemniejszy spód), obrys i cień pod literą;
 * `boldFrom` — od jakiej wielkości napisu kreski mają 2 px szerokości (`null` — nigdy); `plates` — ciemna,
 * półprzezroczysta podkładka pod napisami HUD-u. Wariant wybiera `?font=a|b|c` (porównanie na podglądzie),
 * domyślny — `UI_FONT_DEFAULT`.
 */
export interface UiFontStyle {
  readonly boldFrom: UiTextSize | null;
  readonly shadow: boolean;
  readonly ramp: boolean;
  readonly plates: boolean;
}

export const UI_FONT_STYLES: Readonly<Record<'a' | 'b' | 'c', UiFontStyle>> = {
  /** A „Kuty”: wszystko grubym krojem, z głębią, bez podkładek. */
  a: { boldFrom: 1, shadow: true, ramp: true, plates: false },
  /** B „Tytuły kute, tabliczki”: drobne napisy zwykłą kreską, większe grubą; podkładki pod napisami HUD-u. */
  b: { boldFrom: 2, shadow: true, ramp: true, plates: true },
  /** C „Lekki na tabliczce”: zwykła grubość z głębią + podkładki. */
  c: { boldFrom: null, shadow: true, ramp: true, plates: true },
};

export const UI_FONT_DEFAULT: keyof typeof UI_FONT_STYLES = 'b';

/** Rampa lica: wierzch rozjaśniony, spód przyciemniony (ułamek drogi do jasnego kremu / do czerni). */
export const UI_FONT_RAMP = { lightRowsUntil: 1, light: 0.38, darkRowsFrom: 6, dark: 0.3, shadowColor: 0x07060b, lightTone: 0xfff4d8 } as const;

/** Podkładka pod napisem HUD-u: ciemny prostokąt ze ściętymi rogami. */
export const UI_TEXT_PLATE = { color: 0x07060b, alpha: 0.62, padX: 3, padY: 1 } as const;
