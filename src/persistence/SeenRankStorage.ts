import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import type { SeenRank } from '@/systems/startScoreboard';

/** Ostatnio oglądane miejsce własnego rekordu (krok 93). Uszkodzony wpis = brak; bez magazynu — pamięć sesji. */
export class SeenRankStorage {
  private memory: SeenRank | null = null;

  constructor(
    private readonly storage: KeyValueStorage | null,
    private readonly key: string,
  ) {}

  load(): SeenRank | null {
    if (!this.storage) return this.memory;
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(this.key) ?? 'null');
      return isSeenRank(parsed) ? parsed : null;
    } catch {
      return this.memory;
    }
  }

  save(seen: SeenRank): void {
    this.memory = seen;
    try {
      this.storage?.setItem(this.key, JSON.stringify(seen));
    } catch {
      // Zablokowany magazyn — zostaje w pamięci.
    }
  }
}

function isSeenRank(value: unknown): value is SeenRank {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const rankOk = v.rank === null || (typeof v.rank === 'number' && Number.isInteger(v.rank) && v.rank >= 1);
  return typeof v.timestamp === 'number' && Number.isFinite(v.timestamp) && rankOk;
}
