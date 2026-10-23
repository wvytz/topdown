import type { ScoreComparator, ScoreEntry } from '@/systems/Highscores';
import { buildScoreboard, compareScores, insertScore, isSameEntry } from '@/systems/Highscores';
import type { HighscoreStorage, KeyValueStorage, RecordResult } from '@/persistence/HighscoreStorage';
import { isScoreEntry } from '@/persistence/HighscoreStorage';
import { HIGHSCORE_BOARDS } from '@/config/lootConfig';

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
  /** Kolejka niewysłanych wyników; tablica aren (krok 91a) ma własną. Brak = kolejka wspinaczki. */
  readonly outboxKey?: string;
  /** Porządek tablicy; brak = wspinaczka (złoto, potem piętro). */
  readonly compare?: ScoreComparator;
}


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
    const own = top.findIndex((e) => isSameEntry(e, entry));
    if (own !== -1) top.splice(own, 1);
    const compare = this.options.compare ?? compareScores;
    const { entries, rank } = insertScore(top, entry, this.options.maxEntries, compare);
    return { rank, board: buildScoreboard(entries, { entry, rank }, this.options.podiumSize, compare) };
  }

  /** Wyniki zapisane w tej przeglądarce. */
  localEntries(): ScoreEntry[] {
    return this.local.load();
  }

  /**
   * Wspólna lista dla ekranu startowego (krok 93): najpierw wysyła zaległe wyniki z kolejki, potem pobiera listę.
   * null = brak usługi albo sieci.
   */
  async fetchShared(): Promise<ScoreEntry[] | null> {
    if (!this.remote) return null;
    await this.flushOutbox(this.remote);
    try {
      return (await this.remote.fetchTop(this.options.maxEntries, this.timeout())).filter(isScoreEntry);
    } catch {
      return null;
    }
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

  private get outboxKey(): string {
    return this.options.outboxKey ?? HIGHSCORE_BOARDS.tower.outboxKey;
  }

  private timeout(): AbortSignal {
    return AbortSignal.timeout(this.options.timeoutMs);
  }

  private loadOutbox(): ScoreEntry[] {
    if (!this.outboxStorage) return [...this.memoryOutbox];
    try {
      const parsed: unknown = JSON.parse(this.outboxStorage.getItem(this.outboxKey) ?? '[]');
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
      this.outboxStorage.setItem(this.outboxKey, JSON.stringify(kept));
    } catch {
      // Zablokowany magazyn — kolejka zostaje w pamięci.
    }
  }
}
