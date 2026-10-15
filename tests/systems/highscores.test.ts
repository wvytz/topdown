import { describe, expect, it } from 'vitest';
import type { ScoreEntry } from '@/systems/Highscores';
import { buildScoreboard, compareScores, insertScore, isNameChar, sanitizePlayerName } from '@/systems/Highscores';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';

const e = (score: number, floor = 1, timestamp = 0): ScoreEntry => ({ score, floor, timestamp });

describe('compareScores', () => {
  it('wyższy wynik wygrywa, przy remisie wyższe piętro', () => {
    expect(compareScores(e(50), e(40))).toBeLessThan(0);
    expect(compareScores(e(40, 5), e(40, 3))).toBeLessThan(0);
    expect(compareScores(e(40, 3), e(40, 3))).toBe(0);
  });
});

describe('insertScore', () => {
  const board = [e(100), e(80), e(60), e(40), e(20)];

  it('zwraca miejsce i utrzymuje porządek', () => {
    const { entries, rank } = insertScore(board, e(70), 50);
    expect(rank).toBe(3);
    expect(entries.map((x) => x.score)).toEqual([100, 80, 70, 60, 40, 20]);
  });

  it('pierwszy wynik na pustej liście jest pierwszy', () => {
    expect(insertScore([], e(5), 50).rank).toBe(1);
  });

  it('przy pełnym remisie starszy rekord zachowuje miejsce', () => {
    const { entries, rank } = insertScore([e(50, 2, 1)], e(50, 2, 2), 50);
    expect(rank).toBe(2);
    expect(entries[0]!.timestamp).toBe(1);
  });

  it('obcina listę do maxEntries, ale zwraca prawdziwe miejsce wypadającego wyniku', () => {
    const { entries, rank } = insertScore(board, e(1), 5);
    expect(rank).toBe(6);
    expect(entries).toHaveLength(5);
    expect(entries.some((x) => x.score === 1)).toBe(false);
  });

  it('nie modyfikuje listy wejściowej', () => {
    const copy = [...board];
    insertScore(board, e(90), 50);
    expect(board).toEqual(copy);
  });
});

describe('buildScoreboard', () => {
  const entries = [e(100), e(80), e(60), e(40), e(20)];

  it('run na podium: oznaczony w top 3, bez osobnej linii', () => {
    const view = buildScoreboard(entries, { entry: entries[1]!, rank: 2 }, 3);
    expect(view.top.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(view.top.map((r) => r.isCurrent)).toEqual([false, true, false]);
    expect(view.current).toBeNull();
  });

  it('run poza podium: top 3 + osobna linia z jego miejscem', () => {
    const view = buildScoreboard(entries, { entry: entries[4]!, rank: 5 }, 3);
    expect(view.top).toHaveLength(3);
    expect(view.top.every((r) => !r.isCurrent)).toBe(true);
    expect(view.current).toEqual({ rank: 5, entry: entries[4], isCurrent: true });
  });

  it('mniej wyników niż miejsc na podium — pokazuje tyle, ile jest', () => {
    const view = buildScoreboard([e(10)], { entry: e(10), rank: 1 }, 3);
    expect(view.top).toHaveLength(1);
    expect(view.current).toBeNull();
  });
});

/** Atrapa localStorage. */
class FakeStorage implements KeyValueStorage {
  data = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('QuotaExceeded');
    this.data.set(key, value);
  }
}

describe('HighscoreStorage', () => {
  it('zapisuje i odczytuje wyniki między „sesjami”', () => {
    const storage = new FakeStorage();
    new HighscoreStorage(storage, 50, 3).record(e(30, 2));
    const second = new HighscoreStorage(storage, 50, 3).record(e(50, 3));
    expect(second.rank).toBe(1);
    expect(new HighscoreStorage(storage, 50, 3).load().map((x) => x.score)).toEqual([50, 30]);
  });

  it('pokazuje top 3 i miejsce runu spoza podium', () => {
    const scores = new HighscoreStorage(new FakeStorage(), 50, 3);
    for (const s of [90, 70, 50, 30]) scores.record(e(s));
    const result = scores.record(e(10));
    expect(result.rank).toBe(5);
    expect(result.board.top.map((r) => r.entry.score)).toEqual([90, 70, 50]);
    expect(result.board.current?.rank).toBe(5);
  });

  it('uszkodzone dane w magazynie nie psują gry', () => {
    const storage = new FakeStorage();
    storage.data.set('tower-crawler.highscores.v1', '{to nie json');
    expect(new HighscoreStorage(storage, 50, 3).record(e(5)).rank).toBe(1);

    storage.data.set('tower-crawler.highscores.v1', JSON.stringify([e(9), { score: 'x' }, null, 7]));
    expect(new HighscoreStorage(storage, 50, 3).load()).toEqual([e(9)]);
  });

  it('bez magazynu (np. tryb prywatny) działa w pamięci', () => {
    const scores = new HighscoreStorage(null, 50, 3);
    scores.record(e(20));
    expect(scores.record(e(10)).rank).toBe(2);
  });

  it('błąd zapisu nie przerywa gry', () => {
    const storage = new FakeStorage();
    storage.failWrites = true;
    expect(() => new HighscoreStorage(storage, 50, 3).record(e(5))).not.toThrow();
  });
});

describe('imię gracza', () => {
  it('dopuszcza litery (także polskie), cyfry, spację, _ i -', () => {
    for (const ch of ['a', 'Ż', 'ł', '7', ' ', '_', '-']) expect(isNameChar(ch)).toBe(true);
    for (const ch of ['<', '!', '.', 'ab', '']) expect(isNameChar(ch)).toBe(false);
  });

  it('czyści imię: znaki, spacje i długość', () => {
    expect(sanitizePlayerName('  Wi<c>io  ', 12)).toBe('Wicio');
    expect(sanitizePlayerName('Zła   Żółw', 12)).toBe('Zła Żółw');
    expect(sanitizePlayerName('abcdefghijklmnop', 12)).toBe('abcdefghijkl');
    expect(sanitizePlayerName('abcdefghijk xyz', 12)).toBe('abcdefghijk');
    expect(sanitizePlayerName('!!!', 12)).toBe('');
  });
});
