import { PERF_CONFIG } from '@/config/perfConfig';

/** Podsumowanie okna klatek (krok U0, licznik `?perf=1` i `npm run perf`). Czasy w ms. */
export interface FrameSummary {
  readonly frames: number;
  /** Średnie FPS z odstępów między klatkami. */
  readonly fps: number;
  /** Odstęp między klatkami: mediana, 95. i 99. percentyl, najdłuższy. */
  readonly intervalP50: number;
  readonly intervalP95: number;
  readonly intervalP99: number;
  readonly intervalMax: number;
  /** Praca gry w klatce (logika + rysowanie w JS): mediana i 95. percentyl. */
  readonly workP50: number;
  readonly workP95: number;
  /** Udział klatek wolniejszych niż 60 FPS i szarpnięć (< 30 FPS), 0..1. */
  readonly slowShare: number;
  readonly jankShare: number;
}

/** Percentyl z posortowanej rosnąco tablicy (najbliższy ranga). */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))] ?? 0;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Okno ostatnich klatek: odstęp między klatkami i czas pracy gry w każdej z nich. */
export class FrameStats {
  private readonly intervals: number[] = [];
  private readonly work: number[] = [];

  constructor(private readonly windowFrames: number = PERF_CONFIG.windowFrames) {}

  push(intervalMs: number, workMs: number): void {
    if (!Number.isFinite(intervalMs) || !Number.isFinite(workMs) || intervalMs <= 0) return;
    this.intervals.push(intervalMs);
    this.work.push(Math.max(0, workMs));
    if (this.intervals.length > this.windowFrames) {
      this.intervals.shift();
      this.work.shift();
    }
  }

  reset(): void {
    this.intervals.length = 0;
    this.work.length = 0;
  }

  summary(): FrameSummary {
    const n = this.intervals.length;
    const iv = [...this.intervals].sort((a, b) => a - b);
    const wk = [...this.work].sort((a, b) => a - b);
    const total = this.intervals.reduce((s, v) => s + v, 0);
    const count = (limit: number): number => this.intervals.filter((v) => v > limit).length;
    return {
      frames: n,
      fps: n > 0 ? round1((n * 1000) / total) : 0,
      intervalP50: round1(percentile(iv, 50)),
      intervalP95: round1(percentile(iv, 95)),
      intervalP99: round1(percentile(iv, 99)),
      intervalMax: round1(iv[n - 1] ?? 0),
      workP50: round1(percentile(wk, 50)),
      workP95: round1(percentile(wk, 95)),
      slowShare: n > 0 ? count(PERF_CONFIG.slowFrameMs) / n : 0,
      jankShare: n > 0 ? count(PERF_CONFIG.jankFrameMs) / n : 0,
    };
  }
}

/** Czy adres prosi o licznik wydajności (`?perf=1`). */
export function perfMeterWanted(search: string): boolean {
  return new URLSearchParams(search).get('perf') === '1';
}
