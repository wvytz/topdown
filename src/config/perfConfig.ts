/** Licznik wydajności w prawym górnym rogu (krok 49a, gałąź testowa sterowania). */
export const PERF_OVERLAY = {
  /** Okno statystyki klatek (ms). */
  windowMs: 1000,
  /** Odświeżanie napisu (ms) — tekst przerysowany co klatkę sam kosztowałby wydajność na telefonie. */
  refreshMs: 250,
  /** Co ile mierzymy ping do serwera gry (ms) i po jakim czasie się poddajemy. */
  pingIntervalMs: 2000,
  pingTimeoutMs: 3000,
  /** Najdłuższa klatka powyżej tego progu (ms) barwi licznik na czerwono — wtedy widać szarpanie. */
  worstFrameWarnMs: 34,
  margin: 3,
  fontSize: 10,
  alpha: 0.75,
} as const;
