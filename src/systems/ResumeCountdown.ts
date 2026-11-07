/**
 * Odliczanie po wznowieniu z pauzy (krok 130, uwaga testera): scena stoi jeszcze ok. 3 s z widoczną planszą,
 * żeby gracz przypomniał sobie, w jakiej sytuacji zatrzymał grę. Czas gry jest w tym czasie zamrożony (PauseClock),
 * więc odliczanie liczy surowy czas klatek (`delta`). Czysta logika — rysuje `scenes/PauseScene.ts`.
 */
export interface ResumeCountdownConfig {
  /** Liczba kroków odliczania (3 → „3, 2, 1”). */
  readonly steps: number;
  /** Długość jednego kroku (ms). */
  readonly stepMs: number;
  /** Najdłuższa klatka liczona do odliczania (ms) — po zacięciu karty odliczanie nie przeskakuje. */
  readonly maxFrameMs: number;
  /** Krok 161 (uwaga testera): po tylu ms odliczanie można pominąć kliknięciem / Enter / A — wcześniej nie,
   *  żeby to samo kliknięcie, które wcisnęło „Wznów”, od razu go nie przeskoczyło. */
  readonly minSkipMs: number;
}

export class ResumeCountdown {
  private elapsed = 0;

  constructor(private readonly config: ResumeCountdownConfig) {}

  /** Przesuwa odliczanie o czas klatki; zwraca, czy w tej klatce zmieniła się liczba (albo odliczanie się skończyło). */
  advance(deltaMs: number): boolean {
    if (this.done) return false;
    const before = this.value;
    this.elapsed += Math.min(Math.max(deltaMs, 0), this.config.maxFrameMs);
    return this.value !== before;
  }

  /** Czy pominięcie jest już dozwolone (zob. `minSkipMs`). */
  get canSkip(): boolean {
    return !this.done && this.elapsed >= this.config.minSkipMs;
  }

  /** Pomija resztę odliczania; zwraca, czy się udało. */
  skip(): boolean {
    if (!this.canSkip) return false;
    this.elapsed = this.total;
    return true;
  }

  get total(): number {
    return this.config.steps * this.config.stepMs;
  }

  get done(): boolean {
    return this.elapsed >= this.total;
  }

  /** Liczba na ekranie: 3, 2, 1; 0 po końcu. */
  get value(): number {
    if (this.done) return 0;
    return this.config.steps - Math.floor(this.elapsed / this.config.stepMs);
  }

  /** Postęp bieżącego kroku 0..1 (pulsowanie cyfry). */
  get stepProgress(): number {
    if (this.done) return 1;
    return (this.elapsed % this.config.stepMs) / this.config.stepMs;
  }
}
