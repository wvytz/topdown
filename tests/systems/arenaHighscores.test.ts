import { describe, expect, it } from 'vitest';
import type { ScoreEntry } from '@/systems/Highscores';
import { buildScoreboard, compareArenaScores, insertScore } from '@/systems/Highscores';
import { formatScoreRow } from '@/systems/deathScreen';
import { HIGHSCORE_BOARDS } from '@/config/lootConfig';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import type { RemoteScoreSource } from '@/persistence/SharedHighscores';
import { SharedHighscores } from '@/persistence/SharedHighscores';
import { createWorkerScoreSource } from '@/persistence/remoteScores';

/** `floor` = osiągnięta arena. */
const e = (score: number, arena: number, timestamp = 0): ScoreEntry => ({ score, floor: arena, timestamp });

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('tablica aren bossów (krok 91a)', () => {
  it('dalsza arena wygrywa z większym złotem; przy remisie areny decyduje złoto', () => {
    expect(compareArenaScores(e(10, 5), e(900, 4))).toBeLessThan(0);
    expect(compareArenaScores(e(300, 4), e(200, 4))).toBeLessThan(0);
    expect(compareArenaScores(e(300, 4), e(300, 4))).toBe(0);
  });

  it('miejsce i podium liczone porządkiem aren', () => {
    const board = [e(900, 2), e(100, 4), e(500, 3)];
    const { entries, rank } = insertScore(board, e(50, 3), 50, compareArenaScores);
    expect(rank).toBe(3);
    expect(entries.map((x) => x.floor)).toEqual([4, 3, 3, 2]);
    const view = buildScoreboard(entries, { entry: entries[2]!, rank: 3 }, 5, compareArenaScores);
    expect(view.top[0]?.entry.floor).toBe(4);
    expect(view.top[2]?.isCurrent).toBe(true);
  });

  it('wiersz tablicy aren: arena przed złotem', () => {
    const row = { rank: 1, isCurrent: false, entry: { ...e(340, 5), name: 'Wicio' } };
    expect(formatScoreRow(row, true)).toBe('1. Wicio · arena 5 · 340 złota');
  });

  it('lokalna tablica aren nie miesza się z tablicą wspinaczki', () => {
    const storage = memory();
    const tower = new HighscoreStorage(storage, 50, 5);
    const arenas = new HighscoreStorage(storage, 50, 5, HIGHSCORE_BOARDS.arenas.storageKey, compareArenaScores);
    tower.record(e(1000, 3));
    expect(arenas.record(e(10, 6)).rank).toBe(1);
    expect(arenas.record(e(999, 2)).rank).toBe(2);
    expect(tower.load()).toHaveLength(1);
    expect([...storage.data.keys()].sort()).toEqual([HIGHSCORE_BOARDS.arenas.storageKey, HIGHSCORE_BOARDS.tower.storageKey].sort());
  });

  it('wspólna lista aren: własna kolejka i porządek aren', async () => {
    const stored: ScoreEntry[] = [e(900, 2, 1), e(100, 5, 2)];
    const remote: RemoteScoreSource = {
      fetchTop: async () => [...stored],
      submit: async (entry) => void stored.push(entry),
    };
    const storage = memory();
    const shared = new SharedHighscores(new HighscoreStorage(storage, 50, 5, HIGHSCORE_BOARDS.arenas.storageKey, compareArenaScores), remote, storage, {
      maxEntries: 50,
      podiumSize: 5,
      timeoutMs: 1000,
      maxOutbox: 20,
      outboxKey: HIGHSCORE_BOARDS.arenas.outboxKey,
      compare: compareArenaScores,
    });
    const result = await shared.recordShared(e(50, 3, 3));
    expect(result?.rank).toBe(2);
    expect(result?.board.top.map((r) => r.entry.floor)).toEqual([5, 3, 2]);
    expect(storage.data.get(HIGHSCORE_BOARDS.arenas.outboxKey)).toBe('[]');
    expect(storage.data.has(HIGHSCORE_BOARDS.tower.outboxKey)).toBe(false);
  });

  it('adapter workera używa trasy /arena-scores', async () => {
    const urls: string[] = [];
    const fetchFn = async (url: string) => {
      urls.push(url);
      return new Response('[]', { status: 200 });
    };
    await createWorkerScoreSource('https://x.workers.dev/', fetchFn, HIGHSCORE_BOARDS.arenas.path).fetchTop(10, new AbortController().signal);
    expect(urls[0]).toBe('https://x.workers.dev/arena-scores?limit=10');
  });
});
