/**
 * Pad (krok 95): układ przycisków i czułość gałek.
 *
 * Indeksy według standardowego układu W3C („standard mapping”), który przeglądarki podają dla padów Xbox,
 * PlayStation i większości klonów. Nazwy jak na padzie Xbox (na PlayStation: A = ✕, B = ○, X = □, Y = △).
 */
export const PAD_BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  Back: 8,
  Start: 9,
  LeftStick: 10,
  RightStick: 11,
  Up: 12,
  Down: 13,
  Left: 14,
  Right: 15,
} as const;

/** Osie gałek w standardowym układzie: lewa (ruch) i prawa (celowanie). */
export const PAD_AXIS = { leftX: 0, leftY: 1, rightX: 2, rightY: 3 } as const;

export const GAMEPAD_CONFIG = {
  /** Martwa strefa gałki ruchu (0..1): drobne wychylenie z luzu gałki nie rusza bohatera. */
  moveDeadzone: 0.2,
  /** Martwa strefa gałki celowania — większa, żeby puszczona gałka nie szarpała celownikiem (krok 114: 0,35 → 0,25). */
  aimDeadzone: 0.25,
  /** Od jakiego wciśnięcia (0..1) analogowy przycisk (spust) liczy się jako wciśnięty. */
  pressThreshold: 0.35,
  /** Punkt celowania leży tyle pikseli świata przed bohaterem (liczy się tylko kierunek). */
  aimDistancePx: 64,
  /**
   * Celowanie padem (krok 114, „mało precyzyjne” w teście właściciela).
   * Prawa gałka celuje ręcznie z lekkim dociąganiem do wroga. Bez niej (gra przyciskami X/B, kciuk zdjęty z gałki)
   * atak sam celuje we wroga — najpierw w szerokim stożku przed bohaterem, potem w najbliższego w zasięgu.
   */
  aim: {
    /** Dociąganie prawej gałki: wąski stożek, gracz wybiera cel, gałka tylko poprawia niedokładność. */
    stickAssist: { coneHalfDeg: 10, range: 320 },
    /** Samo celowanie przy ataku bez prawej gałki: stożek wokół kierunku bohatera… */
    autoAimCone: { coneHalfDeg: 50, range: 300 },
    /** …a gdy w nim nikogo nie ma — najbliższy wróg w tym zasięgu (px świata). */
    autoAimRange: 260,
    /** Po puszczeniu prawej gałki jej kierunek trzyma się tyle ms — szybkie „pstryknięcie” gałką nie ucieka. */
    stickHoldMs: 300,
  },
  /**
   * Przyciski akcji w grze (krok 114, decyzja po teście właściciela): jeden układ dla wszystkich bohaterów.
   * Przyciski twarzy: X — atak (LPM), B — drugi atak (PPM), A — dash, Y — E (kapliczka, schody).
   * RB — ultimate. Spusty powtarzają ataki (RT = X, LT = B) dla grających prawą gałką, LB powtarza dash.
   */
  actions: {
    attack: [PAD_BUTTON.X, PAD_BUTTON.RT],
    shoot: [PAD_BUTTON.B, PAD_BUTTON.LT],
    dash: [PAD_BUTTON.A, PAD_BUTTON.LB],
    interact: [PAD_BUTTON.Y],
    ultimate: [PAD_BUTTON.RB],
  },
  /** Nawigacja w menu i na ekranach między grą (pauza, nagroda, śmierć). */
  menu: {
    confirm: [PAD_BUTTON.A],
    back: [PAD_BUTTON.B],
    alt: [PAD_BUTTON.Y],
    pause: [PAD_BUTTON.Start],
    /** Wychylenie lewej gałki, od którego działa jak krzyżak. */
    stickThreshold: 0.6,
    /** Przytrzymany kierunek: pierwsze powtórzenie po `repeatDelayMs`, kolejne co `repeatIntervalMs`. */
    repeatDelayMs: 400,
    repeatIntervalMs: 150,
  },
  /** Po śmierci pad czeka tyle, zanim A/Y/B zaczną działać — wciskany w walce dash nie może od razu restartować runu. */
  deathInputDelayMs: 1500,
} as const;
