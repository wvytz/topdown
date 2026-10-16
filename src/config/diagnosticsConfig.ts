/**
 * Dziennik diagnostyczny (krok 55): zapis błędów i niespotykanych zdarzeń w przeglądarce testera.
 * Liczby limitów i progów — jedno miejsce; sama logika w `systems/Diagnostics.ts`.
 */
export const DIAGNOSTICS = {
  /** Klucz w localStorage (ostatnie sesje z dziennikiem). */
  storageKey: 'tower-crawler.diagnostics.v1',
  /** Ile ostatnich sesji pamiętamy i ile zdarzeń w sesji (starsze wypadają). */
  maxSessions: 3,
  maxEvents: 80,
  /** Przycięcie długich komunikatów i stosów wywołań. */
  maxMessageLength: 300,
  maxStackLength: 700,
  /** Ten sam błąd (rodzaj + treść) w tym oknie zlicza się zamiast mnożyć wpisy; po limicie nie zapisujemy kolejnych. */
  dedupeWindowMs: 10_000,
  maxSameEvents: 4,
  /** Twardy limit rozmiaru zapisu (znaki JSON); nad nim wycinamy najstarsze zdarzenia. */
  maxStorageChars: 120_000,
  /** Puls: co ile zapisujemy stan gry (po twardym wyrzuceniu to jedyny ślad). */
  heartbeatMs: 5000,
  frames: {
    /** Pojedyncza klatka dłuższa niż to = zacięcie (np. odcięta karta, GC, przeciążenie karty graficznej). */
    stallMs: 600,
    /** Odstęp między kolejnymi zapisami zacięć. */
    stallCooldownMs: 5000,
    /** Średni FPS z okna poniżej progu = „mulenie”. */
    lowFpsWindowMs: 5000,
    lowFps: 20,
    lowFpsCooldownMs: 30_000,
  },
  /** Sterta JS (MB), od której zapisujemy ostrzeżenie (raz na sesję). */
  highHeapMB: 700,
  /** Klawisz otwierający panel z raportem. */
  reportKey: 'F9',
} as const;
