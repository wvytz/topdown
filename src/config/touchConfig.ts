/**
 * Sterowanie dotykowe wersji mobilnej (krok 96; przeniesione z gałęzi testowej, kroki „49–49d”).
 * Liczby do strojenia w testach właściciela na telefonie. Piksele płótna 960×540, chyba że opisano inaczej.
 */
import type { CornerButtonSpec } from '@/systems/touchLayout';

/** Wspomaganie celowania gałką: atak dociąga do wroga w wąskim stożku wokół kierunku kciuka. */
export interface AimAssistConfig {
  /** Połowa kąta stożka (°); 0 = bez wspomagania. */
  readonly coneHalfDeg: number;
  /** Najdalszy wróg, do którego celowanie dociąga (px świata). */
  readonly range: number;
}

/** Kciuk jest mniej precyzyjny od myszy — lekkie dociąganie do celu. */
export const TOUCH_AIM_ASSIST: AimAssistConfig = { coneHalfDeg: 12, range: 300 };

/** Wróg słabiej widoczny (Mrok, mgła; alfa z krzywej światła) nie przyciąga celowania. */
export const AIM_ASSIST_MIN_VISIBILITY = 0.5;

/** Odległość punktu celowania od bohatera, gdy celowanie to sam kierunek (px świata). */
export const TOUCH_AIM_POINT_DISTANCE = 64;

/**
 * Gałka ruchu (krok 141: piksele CSS ekranu, nie płótna): pojawia się tam, gdzie lewy kciuk dotknął ekranu,
 * i idzie za kciukiem, gdy ten wyjedzie poza promień (`followStickOrigin`).
 */
export const TOUCH_STICK = {
  /** Promień gałki (px CSS): wychylenie na brzeg = pełna siła. Mniejszy niż wcześniej — krótszy ruch kciuka. */
  radius: 44,
  /** Martwa strefa (ułamek promienia): drobny ruch kciuka nie rusza postaci ani nie zmienia celu. */
  deadzone: 0.18,
  /** Lewa część ekranu (ułamek szerokości) to strefa gałki ruchu. */
  moveZoneWidth: 0.45,
  /** Blada podpowiedź gałki, gdy kciuk jej nie trzyma: środek od lewego dolnego rogu ekranu (px CSS). */
  restHint: { left: 96, bottom: 96 },
  /** Gałki przycisków ataku: promień przeciągnięcia (px CSS). */
  aimRadius: 52,
} as const;

/**
 * Przycisk PPM działa jak gałka (krok 96a): przeciągnięcie celuje ręcznie i strzela, przytrzymanie bez
 * przeciągania po tylu ms strzela z celowaniem samym, a krótkie stuknięcie to jeden strzał w najbliższego wroga
 * (ładunki strzału są cenne — strzał nie leci, zanim kciuk zdąży wybrać stronę).
 * Duże kółko ataku od kroku 141 atakuje od razu przy dotknięciu (celuje samo), przeciągnięcie przejmuje cel.
 */
export const TOUCH_SHOT_HOLD_MS = 150;

/**
 * Jak w Brawl Stars: stuknięcie i przytrzymanie przycisku ataku bez przeciągania celują same
 * w najbliższego widocznego wroga w tym zasięgu (px świata). 0 wyłącza.
 * Ułatwia grę względem myszy — dlatego wyniki z telefonu idą na osobną tablicę.
 */
export const TOUCH_AUTO_AIM_RANGE = 280;
/** Najdłuższy dotyk (ms), który jeszcze liczy się jako stuknięcie. */
export const TOUCH_TAP_MAX_MS = 250;
/** Jak długo (ms) kierunek z automatycznego celowania nie ustępuje kierunkowi ruchu — dłużej niż zamach kuli. */
export const TOUCH_AUTO_AIM_HOLD_MS = 400;

/** Okrągły przycisk: środek od prawego dolnego rogu ekranu i promień (px CSS, krok 141). */
export type TouchButtonSpec = CornerButtonSpec;

/**
 * Układ prawej ręki (krok 96a, prośba właściciela; krok 141 — przy krawędzi ekranu, piksele CSS):
 * duże kółko ataku podstawowego (LPM) w rogu, atak PPM wyżej i bardziej w prawo, dash po lewej od kółka,
 * E nad dashem (tylko gdy coś zrobi), ultimate nad kółkiem.
 * Na szerokim telefonie przyciski leżą w czarnym pasie obok płótna i nie zasłaniają walki.
 * Pauza — przycisk pod minimapą, w pikselach płótna (od prawego górnego rogu płótna).
 */
export const TOUCH_BUTTONS = {
  attack: { right: 92, bottom: 84, radius: 46 },
  shoot: { right: 46, bottom: 190, radius: 34 },
  dash: { right: 196, bottom: 54, radius: 36 },
  interact: { right: 206, bottom: 140, radius: 28 },
  /** Ultimate (krok 98): nad dużym kółkiem, na lewo od PPM; widoczny zawsze, jasny, gdy pasek jest pełny. */
  ultimate: { right: 128, bottom: 196, radius: 28 },
  /**
   * Pauza (krok 140, uwaga właściciela: same „II” były nieczytelne nawet dla niego): podłużny przycisk
   * z ikonką i podpisem „PAUZA”, jaśniejszy od przycisków walki. Środek od prawego górnego rogu płótna.
   */
  pause: { right: 54, top: 160, width: 92, height: 32 },
  /** Strefa dotyku jest trochę większa od rysunku — kciuk nie musi trafić idealnie. */
  hitSlop: 1.25,
} as const;

/** Napisy na przyciskach; przyciski ataku zależą od broni bohatera. */
export const TOUCH_LABELS = {
  attack: { melee: 'ATAK', sorcery: 'KULA', archery: 'ŁUK' },
  shoot: { melee: 'STRZAŁ', sorcery: 'PROMIEŃ', archery: 'SALWA' },
  dash: 'ZRYW',
  interact: 'E',
  ultimate: { melee: 'SZAŁ', sorcery: 'NOVA', archery: 'TOTEM' },
  pause: 'PAUZA',
} as const;

/** Przyciski ekranu śmierci na dotyku: pod napisem „R — nowa wspinaczka”. */
export const TOUCH_DEATH_BUTTONS = {
  y: 496,
  width: 200,
  height: 44,
  gap: 16,
} as const;
