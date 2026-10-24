/**
 * Sterowanie dotykowe wersji mobilnej (krok 96; przeniesione z gałęzi testowej, kroki „49–49d”).
 * Liczby do strojenia w testach właściciela na telefonie. Piksele płótna 960×540, chyba że opisano inaczej.
 */

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

/** Gałka ruchu: pojawia się tam, gdzie lewy kciuk dotknął ekranu. Przyciski ataku też działają jak gałki. */
export const TOUCH_STICK = {
  /** Promień gałki: wychylenie na brzeg = pełna siła. */
  radius: 56,
  /** Martwa strefa (ułamek promienia): drobny ruch kciuka nie rusza postaci ani nie zmienia celu. */
  deadzone: 0.25,
  /** Lewa część ekranu (ułamek szerokości) to strefa gałki ruchu. */
  moveZoneWidth: 0.45,
} as const;

/**
 * Przyciski ataku działają jak gałki (krok 96a): przeciągnięcie celuje ręcznie i atakuje, przytrzymanie bez
 * przeciągania po tylu ms atakuje z celowaniem samym, a krótkie stuknięcie to jeden atak w najbliższego wroga.
 * Dzięki temu pierwszy cios nie leci w starą stronę, zanim kciuk zdąży przesunąć się w bok.
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

/** Okrągły przycisk: środek liczony od prawego dolnego rogu płótna i promień. */
export interface TouchButtonSpec {
  readonly right: number;
  readonly bottom: number;
  readonly radius: number;
}

/**
 * Układ prawej ręki (krok 96a, prośba właściciela): duże kółko ataku podstawowego (LPM) w rogu,
 * atak PPM wyżej i bardziej w prawo, dash po lewej od kółka, E nad dashem (tylko gdy coś zrobi).
 * Pauza — mały przycisk pod minimapą (od prawego górnego rogu).
 */
export const TOUCH_BUTTONS = {
  attack: { right: 120, bottom: 110, radius: 54 },
  shoot: { right: 52, bottom: 222, radius: 34 },
  dash: { right: 232, bottom: 66, radius: 34 },
  interact: { right: 232, bottom: 172, radius: 28 },
  pause: { right: 40, top: 160, radius: 20 },
  /** Strefa dotyku jest trochę większa od rysunku — kciuk nie musi trafić idealnie. */
  hitSlop: 1.2,
} as const;

/** Napisy na przyciskach; przyciski ataku zależą od broni bohatera. */
export const TOUCH_LABELS = {
  attack: { melee: 'ATAK', sorcery: 'KULA', archery: 'ŁUK' },
  shoot: { melee: 'STRZAŁ', sorcery: 'PROMIEŃ', archery: 'SALWA' },
  dash: 'ZRYW',
  interact: 'E',
  pause: 'II',
} as const;

/** Przyciski ekranu śmierci na dotyku: pod napisem „R — nowa wspinaczka”. */
export const TOUCH_DEATH_BUTTONS = {
  y: 496,
  width: 200,
  height: 44,
  gap: 16,
} as const;
