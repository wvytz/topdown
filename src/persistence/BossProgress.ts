import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import { recordBossDefeat } from '@/systems/FloorSelect';

const PROGRESS_KEY = 'tower-crawler.boss-progress.v1';

/** Najwyższe piętro, którego bossa gracz pokonał (krok 91, wybór piętra). Bez magazynu pamięta do końca sesji. */
export class BossProgress {
  private memory = 0;

  constructor(private readonly storage: KeyValueStorage | null) {}

  load(): number {
    if (!this.storage) return this.memory;
    try {
      const value = Number(this.storage.getItem(PROGRESS_KEY));
      return Number.isInteger(value) && value > 0 ? Math.max(value, this.memory) : this.memory;
    } catch {
      return this.memory;
    }
  }

  /** Zapisuje zwycięstwo nad bossem piętra; zwraca nowe najwyższe piętro. */
  record(floor: number): number {
    const best = recordBossDefeat(this.load(), floor);
    this.memory = best;
    try {
      this.storage?.setItem(PROGRESS_KEY, String(best));
    } catch {
      // Zablokowany magazyn — postęp zostaje w pamięci.
    }
    return best;
  }
}
