import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import { PlayerName } from '@/persistence/PlayerName';

describe('PlayerName', () => {
  it('pamięta imię w magazynie między instancjami', () => {
    const data = new Map<string, string>();
    const storage: KeyValueStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    expect(new PlayerName(storage).load()).toBeNull();
    new PlayerName(storage).save('Wicio');
    expect(new PlayerName(storage).load()).toBe('Wicio');
  });

  it('bez magazynu albo przy zablokowanym pamięta imię w pamięci', () => {
    const noStorage = new PlayerName(null);
    noStorage.save('A');
    expect(noStorage.load()).toBe('A');

    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const name = new PlayerName(blocked);
    name.save('B');
    expect(name.load()).toBe('B');
  });
});
