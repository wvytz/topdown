/**
 * Statystyka klatek do licznika wydajności (krok 49a): średni FPS i najdłuższa klatka z ostatniego okna.
 * Najdłuższa klatka mówi o „szarpaniu” więcej niż średnia — 60 FPS z pojedynczymi klatkami po 100 ms to lag.
 */
export class FrameStats {
  private readonly frames: number[] = [];
  private total = 0;

  /** @param windowMs długość okna, z którego liczymy statystykę */
  constructor(private readonly windowMs: number) {}

  /** Dodaje czas trwania jednej klatki (ms). */
  add(deltaMs: number): void {
    if (!(deltaMs > 0)) return;
    this.frames.push(deltaMs);
    this.total += deltaMs;
    // Najstarsze klatki wypadają, gdy okno jest pełne (zostaje co najmniej jedna).
    while (this.frames.length > 1 && this.total - this.frames[0]! >= this.windowMs) {
      this.total -= this.frames.shift()!;
    }
  }

  /** Średnia liczba klatek na sekundę w oknie; 0 bez pomiarów. */
  get fps(): number {
    return this.total > 0 ? (this.frames.length * 1000) / this.total : 0;
  }

  /** Najdłuższa klatka w oknie (ms). */
  get worstMs(): number {
    return this.frames.reduce((max, ms) => Math.max(max, ms), 0);
  }
}
