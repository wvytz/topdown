/** Limity odtwarzania jednego rodzaju dźwięku. */
export interface SoundGateRule {
  /** Najkrótsza przerwa między kolejnymi odtworzeniami (ms) — krótsze wywołania zlewają się w jedno. */
  readonly minGapMs: number;
}

export interface SoundGateConfig {
  /** Najwięcej efektów (wszystkich rodzajów) w oknie `windowMs` — reszta przepada. */
  readonly maxPerWindow: number;
  readonly windowMs: number;
}

/**
 * Bramka dźwięków (krok 116): w co-opie dwóch bohaterów często robi to samo naraz (dwa ciosy, oba trafione
 * jednym wybuchem), a fala upiorów ginie w jednej klatce. Ten sam efekt w odstępie krótszym niż `minGapMs`
 * gra raz, a ogólny limit na okno czasu nie pozwala zlać się wszystkiemu w hałas.
 */
export class SoundGate<K extends string> {
  private readonly lastAt = new Map<K, number>();
  private recent: number[] = [];

  constructor(
    private readonly rules: Readonly<Record<K, SoundGateRule>>,
    private readonly config: SoundGateConfig,
  ) {}

  /** Czy zagrać dźwięk teraz; jeśli tak — zapisuje odtworzenie. */
  allow(cue: K, nowMs: number): boolean {
    const last = this.lastAt.get(cue);
    if (last !== undefined && nowMs - last < this.rules[cue].minGapMs) return false;
    this.recent = this.recent.filter((at) => nowMs - at < this.config.windowMs);
    if (this.recent.length >= this.config.maxPerWindow) return false;
    this.lastAt.set(cue, nowMs);
    this.recent.push(nowMs);
    return true;
  }
}
