/**
 * Sterowanie (krok 49): celowanie trzech typów graczy — mysz, sama klawiatura, ekran dotykowy.
 * Liczby do strojenia w testach właściciela na telefonie i klawiaturze.
 */

import type { AimSource } from '@/core/types';

export type { AimSource };

/** Wspomaganie celowania: atak dociąga do wroga, który jest w wąskim stożku wokół kierunku gracza. */
export interface AimAssistConfig {
  /** Połowa kąta stożka (°); 0 = bez wspomagania. */
  readonly coneHalfDeg: number;
  /** Najdalszy wróg, do którego celowanie dociąga (px świata). */
  readonly range: number;
}

/**
 * Mysz celuje dokładnie, więc nie dostaje wspomagania. Klawiatura ma tylko 8 kierunków (błąd do 22,5°),
 * dotyk — płynny kąt, ale mniej precyzyjny kciuk.
 */
export const AIM_ASSIST: Readonly<Record<AimSource, AimAssistConfig>> = {
  mouse: { coneHalfDeg: 0, range: 0 },
  keyboard: { coneHalfDeg: 20, range: 300 },
  touch: { coneHalfDeg: 12, range: 300 },
};

/** Wróg słabiej widoczny (Mrok, mgła; alfa z krzywej światła) nie przyciąga celowania. */
export const AIM_ASSIST_MIN_VISIBILITY = 0.5;

/** Odległość punktu celowania od gracza, gdy celowanie to sam kierunek (klawiatura, dotyk); px świata. */
export const AIM_POINT_DISTANCE = 64;

/** Gałki na ekranie dotykowym (px płótna 960×540). */
export const TOUCH_STICK = {
  /** Promień gałki: wychylenie na brzeg = pełna siła. */
  radius: 56,
  /** Martwa strefa (ułamek promienia): drobny ruch kciuka nie rusza postaci ani nie atakuje. */
  deadzone: 0.25,
  /** Lewa część ekranu (ułamek szerokości) to strefa gałki ruchu; reszta — gałki celowania. */
  moveZoneWidth: 0.45,
} as const;

/** Przyciski dotykowe (px płótna): środek liczony od prawego dolnego rogu. */
export const TOUCH_BUTTONS = {
  radius: 30,
  /** Strzał (barbarzyńca) / promień (Czarodziejka). */
  shoot: { right: 70, bottom: 200 },
  dash: { right: 160, bottom: 120 },
  interact: { right: 150, bottom: 225 },
} as const;

/** Przyciski ekranu śmierci na dotyku (px płótna): pod napisem „R — nowa wspinaczka”. */
export const TOUCH_DEATH_BUTTONS = {
  y: 496,
  width: 220,
  height: 44,
  gap: 24,
} as const;
