/** Metadane nagrania wejść: wszystko, czego trzeba, by odtworzyć piętro od początku (seed + stan runu na starcie piętra). */
export interface RecordingMeta {
  readonly runSeed: number;
  readonly floor: number;
  readonly hero: string;
  readonly gold: number;
  readonly items: readonly string[];
  /** null = pełne HP. */
  readonly hp: number | null;
  readonly practice: boolean;
  /** Znacznik czasu startu piętra (ms epoch). */
  readonly startedAt: number;
}

/**
 * Nagranie wejść gracza z jednego piętra (krok 56). `entries` to zmiany stanu wejścia zakodowane tekstem:
 * `dtMs,ruchX,ruchY,flagi,celX,celY` rozdzielone średnikiem (flagi: 1 = atak, 2 = dash, 4 = strzał, 8 = interakcja).
 */
export interface InputRecording {
  readonly meta: RecordingMeta;
  readonly entries: string;
  readonly count: number;
  /** Czas pierwszego wpisu od startu piętra (ms) — gdy nagranie przycięto, nie jest to 0. */
  readonly firstAtMs: number;
  readonly durationMs: number;
  /** true = zabrakło miejsca i najstarsze wpisy odrzucono: odtworzenie od początku piętra jest niemożliwe. */
  readonly truncated: boolean;
}
