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

/** Gałki: pojawiają się tam, gdzie kciuk dotknął ekranu. */
export const TOUCH_STICK = {
  /** Promień gałki: wychylenie na brzeg = pełna siła. */
  radius: 56,
  /** Martwa strefa (ułamek promienia): drobny ruch kciuka nie rusza postaci ani nie atakuje. */
  deadzone: 0.25,
  /** Lewa część ekranu (ułamek szerokości) to strefa gałki ruchu; reszta — gałki ataku. */
  moveZoneWidth: 0.45,
} as const;

/**
 * Przycisk strzału jako gałka: strzał czeka, aż kciuk zjedzie z przycisku w stronę celu
 * albo przytrzyma go tyle ms (wtedy celuje sam) — pierwszy pocisk nie leci w starą stronę.
 */
export const TOUCH_SHOT_HOLD_MS = 150;

/**
 * Jak w Brawl Stars: stuknięcie strefy ataku albo przycisku strzału oraz przytrzymanie przycisku strzału
 * bez przeciągania celują same w najbliższego widocznego wroga w tym zasięgu (px świata). 0 wyłącza.
 * Ułatwia grę względem myszy — dlatego wyniki z telefonu idą na osobną tablicę.
 */
export const TOUCH_AUTO_AIM_RANGE = 280;
/** Najdłuższy dotyk (ms), który jeszcze liczy się jako stuknięcie. */
export const TOUCH_TAP_MAX_MS = 250;
/** Jak długo (ms) kierunek z automatycznego celowania nie ustępuje kierunkowi ruchu — dłużej niż zamach kuli. */
export const TOUCH_AUTO_AIM_HOLD_MS = 400;

/** Przyciski (px płótna): środek liczony od prawego dolnego rogu; pauza — od prawego górnego. */
export const TOUCH_BUTTONS = {
  radius: 30,
  /** Strzał (barbarzyńca) / promień (Czarodziejka) / salwa (łucznik). */
  shoot: { right: 70, bottom: 200 },
  dash: { right: 160, bottom: 120 },
  interact: { right: 150, bottom: 225 },
  /** Pauza: mały przycisk pod minimapą. */
  pause: { right: 40, top: 160, radius: 20 },
  /** Strefa dotyku jest trochę większa od rysunku — kciuk nie musi trafić idealnie. */
  hitSlop: 1.15,
} as const;

/** Napisy na przyciskach; przycisk strzału zależy od broni bohatera. */
export const TOUCH_LABELS = {
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
