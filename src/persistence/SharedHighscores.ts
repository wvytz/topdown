import type { ScoreEntry } from '@/systems/Highscores';
import { buildScoreboard, insertScore } from '@/systems/Highscores';
import type { HighscoreStorage, KeyValueStorage, RecordResult } from '@/persistence/HighscoreStorage';
import { isScoreEntry } from '@/persistence/HighscoreStorage';

/**
 * Zdalne źródło wspólnej listy — konkretną usługę (np. Supabase) podpinamy adapterem.
 * Obie metody rzucają przy błędzie sieci lub odpowiedzi; `signal` przerywa zapytanie po limicie czasu.
 */
export interface RemoteScoreSource {
  fetchTop(limit: number, signal: AbortSignal): Promise<ScoreEntry[]>;
  submit(entry: ScoreEntry, signal: AbortSignal): Promise<void>;
}

export interface SharedHighscoresOptions {
  readonly maxEntries: number;
  readonly podiumSize: number;
  readonly timeoutMs: number;
  readonly maxOutbox: number;
}

const OUTBOX_KEY = 'tower-crawler.highscores.outbox.v1';

/**
 * Wspólna tablica wyników. Lokalny zapis (`HighscoreStorage`) działa zawsze i od razu;
 * zdalna lista dochodzi asynchronicznie. Bez sieci wynik czeka w kolejce i leci przy następnym runie.
 */
export class SharedHighscores {
  private memoryOutbox: ScoreEntry[] = [];

  constructor(
    private readonly local: HighscoreStorage,
    private readonly remote: RemoteScoreSource | null,
    private readonly outboxStorage: KeyValueStorage | null,
    private readonly options: SharedHighscoresOptions,
  ) {}

  get hasRemote(): boolean {
    return this.remote !== null;
  }

  /** Zapis lokalny — natychmiastowy wynik dla ekranu śmierci. */
  record(entry: ScoreEntry): RecordResult {
    return this.local.record(entry);
  }

  /**
   * Wysyła wynik (i zaległe z kolejki) i zwraca miejsce na wspólnej liście.
   * null = brak usługi albo sieci; wtedy zostaje wynik lokalny.
   */
  async recordShared(entry: ScoreEntry): Promise<RecordResult | null> {
    if (!this.remote) return null;
    this.saveOutbox([...this.loadOutbox(), entry]);
    await this.flushOutbox(this.remote);

    let top: ScoreEntry[];
    try {
      top = (await this.remote.fetchTop(this.options.maxEntries, this.timeout())).filter(isScoreEntry);
    } catch {
      return null;
    }
    // Wpis mógł już trafić na listę — liczymy miejsce bez niego, żeby nie policzyć go dwa razy.
    const own = top.findIndex((e) => sameEntry(e, entry));
    if (own !== -1) top.splice(own, 1);
    const { entries, rank } = insertScore(top, entry, this.options.maxEntries);
    return { rank, board: buildScoreboard(entries, { entry, rank }, this.options.podiumSize) };
  }

  /** Wysyła kolejkę po kolei; przy pierwszym błędzie przerywa, reszta czeka na następny raz. */
  private async flushOutbox(remote: RemoteScoreSource): Promise<void> {
    const pending = this.loadOutbox();
    let sent = 0;
    for (const entry of pending) {
      try {
        await remote.submit(entry, this.timeout());
      } catch {
        break;
      }
      sent++;
    }
    if (sent > 0) this.saveOutbox(pending.slice(sent));
  }

  private timeout(): AbortSignal {
    return AbortSignal.timeout(this.options.timeoutMs);
  }

  private loadOutbox(): ScoreEntry[] {
    if (!this.outboxStorage) return [...this.memoryOutbox];
    try {
      const parsed: unknown = JSON.parse(this.outboxStorage.getItem(OUTBOX_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isScoreEntry) : [];
    } catch {
      return [...this.memoryOutbox];
    }
  }

  private saveOutbox(entries: ScoreEntry[]): void {
    // Przy przepełnieniu odrzucamy najstarsze.
    const kept = entries.slice(-this.options.maxOutbox);
    this.memoryOutbox = kept;
    if (!this.outboxStorage) return;
    try {
      this.outboxStorage.setItem(OUTBOX_KEY, JSON.stringify(kept));
    } catch {
      // Zablokowany magazyn — kolejka zostaje w pamięci.
    }
  }
}

function sameEntry(a: ScoreEntry, b: ScoreEntry): boolean {
  return a.score === b.score && a.floor === b.floor && a.timestamp === b.timestamp && a.name === b.name;
}
