/** Wybór piętra (krok 91, pomysł właściciela): napisy i zasada tablicy wyników. */
export const FLOOR_SELECT_CONFIG = {
  /**
   * Czy run od wybranego piętra trafia na tablicę wyników. false = nie: wynik to złoto, a wyższe piętra dają
   * więcej złota, więc start wyżej byłby nieuczciwy wobec zwykłej wspinaczki. Zmiana tylko za zgodą właściciela.
   */
  ranked: false,
} as const;

export const FLOOR_SELECT_TEXT = {
  modeName: 'WYBÓR PIĘTRA',
  /** Opis na ekranie wyboru bohatera. */
  selectHint: (floorLabel: string): string => `start: ${floorLabel} · wynik nie trafia na tablicę`,
  startToast: (floorLabel: string): string => `Wybór piętra: ${floorLabel} — wynik nie trafi na tablicę`,
  deathHeader: 'WYBÓR PIĘTRA — WYNIK NIE TRAFIA NA TABLICĘ',
  deathPrompt: 'R — OD TEGO PIĘTRA · C — ZMIANA BOHATERA · M — MENU',
} as const;
