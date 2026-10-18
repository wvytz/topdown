/**
 * Zegar pauzy (krok 70). `scene.pause()` zatrzymuje scenę, ale czas gry płynie dalej — po wznowieniu wszystkie
 * czasy odnowienia, zamachy bossów i komunikaty uznałyby, że minęły. Zegar „zamraża” czas przekazywany scenom
 * na czas pauzy i po wznowieniu ciągnie go dalej od tego samego punktu (czas pauzy wypada z osi czasu gry).
 * Czysta logika: `shift` dostaje surowy czas z pętli Phasera, zwraca czas gry.
 */
export class PauseClock {
  private offset = 0;
  private pausedAt: number | null = null;
  private lastRaw = 0;

  get isPaused(): boolean {
    return this.pausedAt !== null;
  }

  /** Czas gry dla surowego czasu klatki; w pauzie stoi w miejscu. Wołać w każdej klatce. */
  shift(raw: number): number {
    this.lastRaw = raw;
    return (this.pausedAt ?? raw) - this.offset;
  }

  /** Zamraża czas od ostatnio widzianej klatki. */
  begin(): void {
    if (this.pausedAt === null) this.pausedAt = this.lastRaw;
  }

  /** Wznawia: czas pauzy dodaje do przesunięcia, więc czas gry płynie od miejsca zatrzymania. */
  end(): void {
    if (this.pausedAt === null) return;
    this.offset += this.lastRaw - this.pausedAt;
    this.pausedAt = null;
  }
}

export interface AutoPauseContext {
  /** `location.search` strony. */
  readonly search: string;
  /** Tryb dev (Vite): auto-pauza domyślnie wyłączona, bo panel narzędzi zabiera fokus. */
  readonly dev: boolean;
  /** `navigator.webdriver` — bot (smoke) nie może się zatrzymać. */
  readonly webdriver: boolean;
}

/** Czy utrata fokusu ma pauzować grę. Parametr adresu ma pierwszeństwo przed domyślnym zachowaniem. */
export function autoPauseEnabled(ctx: AutoPauseContext, param: string): boolean {
  const value = new URLSearchParams(ctx.search).get(param);
  if (value === '1') return true;
  if (value === '0') return false;
  return !ctx.dev && !ctx.webdriver;
}
