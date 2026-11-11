/**
 * Licznik wydajności `?perf=1` (krok U0): ile ostatnich klatek liczymy i progi „wolnej” klatki.
 * Ten sam licznik czyta skrypt `npm run perf`, żeby pomiar z automatu i z telefonu właściciela był porównywalny.
 */
export const PERF_CONFIG = {
  /** Okno statystyk: ostatnie klatki (ok. 5 s przy 60 FPS). */
  windowFrames: 300,
  /** Klatka dłuższa niż tyle ms gubi 60 FPS. */
  slowFrameMs: 1000 / 60 + 1,
  /** Klatka dłuższa niż tyle ms to widoczne szarpnięcie (poniżej 30 FPS). */
  jankFrameMs: 1000 / 30 + 1,
  /** Co ile ms odświeżać napis licznika. */
  refreshMs: 500,
} as const;
