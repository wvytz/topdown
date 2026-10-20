import type { ScoreEntry, ScoreboardView } from '@/systems/Highscores';
import { buildScoreboard, insertScore } from '@/systems/Highscores';

/** Minimalny interfejs magazynu — w grze localStorage, w testach atrapa. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'tower-crawler.highscores.v1';

export interface RecordResult {
  readonly rank: number;
  readonly board: ScoreboardView;
}

/**
 * Trwały zapis wyników. Odporny na brak magazynu (tryb prywatny, zablokowane dane)
 * i na uszkodzone dane — wtedy działa w pamięci, a gra toczy się dalej.
 */
export class HighscoreStorage {
  private memory: ScoreEntry[] = [];

  constructor(
    private readonly storage: KeyValueStorage | null,
    private readonly maxEntries: number,
    private readonly podiumSize: number,
  ) {}

  /** Magazyn przeglądarki, jeśli jest dostępny. */
  static browserStorage(): KeyValueStorage | null {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  }

  load(): ScoreEntry[] {
    if (!this.storage) return [...this.memory];
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isScoreEntry) : [];
    } catch {
      return [...this.memory];
    }
  }

  record(entry: ScoreEntry): RecordResult {
    const { entries, rank } = insertScore(this.load(), entry, this.maxEntries);
    this.save(entries);
    return { rank, board: buildScoreboard(entries, { entry, rank }, this.podiumSize) };
  }

  private save(entries: ScoreEntry[]): void {
    this.memory = entries;
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Pełny lub zablokowany magazyn — wyniki zostają w pamięci do końca sesji.
    }
  }
}

export function isScoreEntry(value: unknown): value is ScoreEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const numbersOk = [v.score, v.floor, v.timestamp].every((n) => typeof n === 'number' && Number.isFinite(n));
  return numbersOk && (v.name === undefined || typeof v.name === 'string') && (v.hero === undefined || typeof v.hero === 'string');
}
