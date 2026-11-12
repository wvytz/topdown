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
  /**
   * Skala drobnych napisów HUD-u. Na telefonie 2 (płótno jest pomniejszone). Krok U7b: próba ze skalą 2 na PC
   * odrzucona przez właściciela („napisy w HUD są za duże… ponad pół ekranu zajmuje zbędna informacja”).
   */
  textScale: { pc: 1 as const, mobile: 2 as const },
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
  /**
   * Ile ms po zmianie celu widać pełną podpowiedź („znajdź komnatę bossa…”), potem zostaje skrót.
   * Krok U7b: 0 — sam skrót („WROGOWIE: 6”, „SCHODY OTWARTE”), bo pełna podpowiedź to „zbędna informacja”.
   */
  objectiveLongMs: 0,
  /** Opis modyfikatora piętra (własna linia pod przedmiotami): widoczny przez tyle ms od wejścia na piętro, potem gaśnie. */
  modifierLongMs: 9000,
  /** Szerokość łamania opisu modyfikatora i wiadomości o przedmiocie pod rzędem przedmiotów. */
  noteWrap: 480,
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
 * Wygląd liter (krok U7b) — recepta napisu POLEGŁEŚ z ekranu śmierci przeniesiona na cały interfejs
 * (ocena właściciela po U7a: „wszystkie są złe… zbyt pixelowe, zbyt pionowe, bez obramowania jak np. napis
 * »poległeś«”). Litera z dużych pikseli fontu, cienki czarny obrys krzyżem (ścięte rogi), pod nią lico
 * przesunięte w dół w ciemnym odcieniu barwy (cień), lico w paskach rampy od jasnego wierzchu do ciemnego spodu
 * i szersze odstępy między literami. Wszystkie wielkości w pikselach płótna 960×540.
 */
export const UI_FONT_LOOK = {
  /** Obrys = ułamek piksela fontu (POLEGŁEŚ: piksel 8, obrys 2), co najmniej 1 px. */
  outlineFraction: 0.25,
  /** Cień: lico przesunięte w dół o tyle obrysów (POLEGŁEŚ: 2). */
  shadowOutlines: 2,
  /** Cień w barwie napisu przyciemnionej o ten ułamek (POLEGŁEŚ: ciemna krew pod czerwienią). */
  shadowDarken: 0.5,
  /** Wysokość paska rampy (px płótna; POLEGŁEŚ: 2) — barwa zmienia się skokowo, po pikselowemu. */
  stripPx: 2,
  /**
   * Rampa lica od wierzchu do spodu wersalika: dodatnie = ułamek drogi do jasnego kremu, ujemne = do czerni.
   * Akcenty nad literą biorą pierwszy ton, ogonki i dolne wydłużenia — ostatni.
   */
  ramp: [0.62, 0.42, 0.2, 0, -0.16, -0.32, -0.46, -0.56],
  lightTone: 0xfff4d8,
  /** Dodatkowy odstęp między literami: ułamek piksela fontu (POLEGŁEŚ: odstęp 2 piksele fontu zamiast 1). */
  extraGapFraction: 0.5,
} as const;
