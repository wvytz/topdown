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
  /** Nagrywanie wejść gracza od początku piętra (krok 56). */
  inputs: {
    /** Limit zmian wejścia na piętro (po przekroczeniu najstarsze wypadają, nagranie jest „przycięte”). */
    maxEntries: 2500,
    /** Celowanie zapisujemy, gdy przesunie się o tyle px świata. */
    aimStepPx: 24,
    /** Ile ostatnich nagrań (pięter) trzymamy w pamięci przeglądarki i twardy limit rozmiaru zapisu. */
    maxRecordings: 3,
    maxStorageChars: 160_000,
    storageKey: 'tower-crawler.inputs.v1',
  },
  /** Wykrywacze zawieszeń i niemożliwych sytuacji w grze (krok 56). */
  anomalies: {
    /** Co ile ms próbkujemy stan gry. */
    sampleMs: 500,
    /** Gracz trzyma klawisze ruchu co najmniej `windowMs`, a przesunął się o mniej niż `minMovePx`. */
    stuck: { windowMs: 4000, minMovePx: 6, cooldownMs: 30_000 },
    /** Walka z bossem trwa, a jego HP nie zmienia się tak długo. */
    bossStallMs: 90_000,
    /** Limity liczności (obiekty na scenie, żywi wrogowie); po przekroczeniu zapisujemy raz na `limitCooldownMs`. */
    limits: { displayObjects: 3000, enemies: 60 },
    limitCooldownMs: 60_000,
  },
  /** Sterta JS (MB), od której zapisujemy ostrzeżenie (raz na sesję). */
  highHeapMB: 700,
  /** Klawisz otwierający panel z raportem. */
  reportKey: 'F9',
} as const;
