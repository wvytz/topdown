import { describe, expect, it } from 'vitest';
import { HeroId } from '@/core/heroTypes';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import { LastHero } from '@/persistence/LastHero';

describe('LastHero', () => {
  it('pamięta wybór w magazynie między instancjami', () => {
    const data = new Map<string, string>();
    const storage: KeyValueStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    expect(new LastHero(storage).load()).toBeNull();
    new LastHero(storage).save(HeroId.Sorceress);
    expect(new LastHero(storage).load()).toBe(HeroId.Sorceress);
  });

  it('nieznana wartość w magazynie = brak wyboru', () => {
    const storage: KeyValueStorage = { getItem: () => 'nekromanta', setItem: () => undefined };
    expect(new LastHero(storage).load()).toBeNull();
  });

  it('przy zablokowanym magazynie pamięta wybór w pamięci', () => {
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const hero = new LastHero(blocked);
    hero.save(HeroId.Sorceress);
    expect(hero.load()).toBe(HeroId.Sorceress);
  });
});
