import { describe, expect, it } from 'vitest';
import type { ScoreEntry } from '@/systems/Highscores';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import type { RemoteScoreSource } from '@/persistence/SharedHighscores';
import { SharedHighscores } from '@/persistence/SharedHighscores';
import { SeenRankStorage } from '@/persistence/SeenRankStorage';

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const options = { maxEntries: 50, podiumSize: 5, timeoutMs: 1000, maxOutbox: 20 };

describe('wyniki na ekranie startowym (krok 94)', () => {
  it('fetchShared wysyła zaległą kolejkę i zwraca wspólną listę', async () => {
    const stored: ScoreEntry[] = [{ score: 100, floor: 2, timestamp: 1, name: 'Ala' }];
    const remote: RemoteScoreSource = { fetchTop: async () => [...stored], submit: async (entry) => void stored.push(entry) };
    const storage = memory();
    storage.setItem('tower-crawler.highscores.outbox.v1', JSON.stringify([{ score: 50, floor: 1, timestamp: 2 }]));
    const shared = new SharedHighscores(new HighscoreStorage(storage, 50, 5), remote, storage, options);
    expect((await shared.fetchShared())?.map((x) => x.score)).toEqual([100, 50]);
    expect(storage.data.get('tower-crawler.highscores.outbox.v1')).toBe('[]');
  });

  it('fetchShared bez usługi albo przy błędzie sieci = null', async () => {
    const storage = memory();
    expect(await new SharedHighscores(new HighscoreStorage(storage, 50, 5), null, storage, options).fetchShared()).toBeNull();
    const broken: RemoteScoreSource = {
      fetchTop: async () => Promise.reject(new Error('sieć')),
      submit: async () => undefined,
    };
    expect(await new SharedHighscores(new HighscoreStorage(storage, 50, 5), broken, storage, options).fetchShared()).toBeNull();
  });

  it('localEntries zwraca wyniki tej przeglądarki', () => {
    const storage = memory();
    const shared = new SharedHighscores(new HighscoreStorage(storage, 50, 5), null, storage, options);
    shared.record({ score: 10, floor: 1, timestamp: 3 });
    expect(shared.localEntries()).toEqual([{ score: 10, floor: 1, timestamp: 3 }]);
  });

  it('pamięć miejsca: zapis, odczyt, uszkodzony wpis i brak magazynu', () => {
    const storage = memory();
    const seen = new SeenRankStorage(storage, 'k');
    expect(seen.load()).toBeNull();
    seen.save({ timestamp: 5, rank: null });
    expect(seen.load()).toEqual({ timestamp: 5, rank: null });
    storage.setItem('k', '{"timestamp":5,"rank":0}');
    expect(seen.load()).toBeNull();
    storage.setItem('k', 'nie-json');
    expect(seen.load()).toEqual({ timestamp: 5, rank: null });
    const noStorage = new SeenRankStorage(null, 'k');
    noStorage.save({ timestamp: 1, rank: 2 });
    expect(noStorage.load()).toEqual({ timestamp: 1, rank: 2 });
  });
});
