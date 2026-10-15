import { describe, expect, it } from 'vitest';
import type { ScoreEntry } from '@/systems/Highscores';
import { compareScores } from '@/systems/Highscores';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import type { RemoteScoreSource } from '@/persistence/SharedHighscores';
import { SharedHighscores } from '@/persistence/SharedHighscores';

const e = (score: number, timestamp = score): ScoreEntry => ({ score, floor: 1, timestamp });

/** Atrapa usługi: lista w pamięci, `online` przełącza awarię sieci. */
class FakeRemote implements RemoteScoreSource {
  online = true;
  stored: ScoreEntry[] = [];
  async fetchTop(limit: number): Promise<ScoreEntry[]> {
    if (!this.online) throw new Error('offline');
    return [...this.stored].sort(compareScores).slice(0, limit);
  }
  async submit(entry: ScoreEntry): Promise<void> {
    if (!this.online) throw new Error('offline');
    this.stored.push(entry);
  }
}

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const OPTIONS = { maxEntries: 50, podiumSize: 3, timeoutMs: 1000, maxOutbox: 3 };

function setup(remote: RemoteScoreSource | null) {
  const storage = memoryStorage();
  const shared = new SharedHighscores(new HighscoreStorage(storage, 50, 3), remote, storage, OPTIONS);
  return { shared, storage };
}

describe('SharedHighscores', () => {
  it('bez usługi zwraca null, a zapis lokalny działa', async () => {
    const { shared } = setup(null);
    expect(shared.record(e(10)).rank).toBe(1);
    expect(await shared.recordShared(e(10))).toBeNull();
  });

  it('wysyła wynik i liczy miejsce na wspólnej liście (bez liczenia go dwa razy)', async () => {
    const remote = new FakeRemote();
    remote.stored = [e(100), e(50), e(5)];
    const { shared } = setup(remote);
    const result = await shared.recordShared(e(70));
    expect(result?.rank).toBe(2);
    expect(result?.board.top.map((r) => r.entry.score)).toEqual([100, 70, 50]);
    expect(remote.stored).toHaveLength(4);
  });

  it('bez sieci kolejkuje wynik i wysyła go przy następnej próbie', async () => {
    const remote = new FakeRemote();
    const { shared } = setup(remote);
    remote.online = false;
    expect(await shared.recordShared(e(30))).toBeNull();
    expect(remote.stored).toHaveLength(0);

    remote.online = true;
    const result = await shared.recordShared(e(20));
    expect(remote.stored.map((x) => x.score)).toEqual([30, 20]);
    expect(result?.rank).toBe(2);
  });

  it('kolejka ma limit i odrzuca najstarsze wpisy', async () => {
    const remote = new FakeRemote();
    const { shared } = setup(remote);
    remote.online = false;
    for (const s of [1, 2, 3, 4, 5]) await shared.recordShared(e(s));
    remote.online = true;
    await shared.recordShared(e(6));
    expect(remote.stored.map((x) => x.score)).toEqual([4, 5, 6]);
  });

  it('odrzuca uszkodzone wpisy z usługi', async () => {
    const remote = new FakeRemote();
    remote.stored = [{ score: 'x' } as unknown as ScoreEntry, e(40)];
    remote.fetchTop = async () => remote.stored;
    const { shared } = setup(remote);
    const result = await shared.recordShared(e(10));
    expect(result?.board.top.map((r) => r.entry.score)).toEqual([40, 10]);
  });
});
