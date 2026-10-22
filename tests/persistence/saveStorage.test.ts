import { describe, expect, it } from 'vitest';
import { HeroId } from '@/core/heroTypes';
import type { SaveKeyValueStorage } from '@/persistence/SaveStorage';
import { SaveStorage } from '@/persistence/SaveStorage';
import type { SaveData } from '@/systems/SaveGame';

const data: SaveData = { runSeed: 7, floor: 2, run: { hero: HeroId.Barbarian, gold: 100, items: [], hp: 80, practice: false } };

function memoryStorage(): SaveKeyValueStorage & { data: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    data: map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const blocked: SaveKeyValueStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('SaveStorage', () => {
  it('autozapis i sloty są niezależne i przetrwają nową instancję', () => {
    const storage = memoryStorage();
    expect(new SaveStorage(storage).save('auto', data, 1)).toBe(true);
    new SaveStorage(storage).save(2, { ...data, floor: 5 }, 2);
    const fresh = new SaveStorage(storage);
    expect(fresh.load('auto')?.floor).toBe(2);
    expect(fresh.load(1)).toBeNull();
    expect(fresh.load(2)?.floor).toBe(5);
    expect(storage.data.size).toBe(2);
  });

  it('usuwanie czyści slot', () => {
    const saves = new SaveStorage(memoryStorage());
    saves.save('auto', data, 1);
    saves.remove('auto');
    expect(saves.load('auto')).toBeNull();
  });

  it('slot spoza zakresu nic nie zapisuje', () => {
    const storage = memoryStorage();
    const saves = new SaveStorage(storage, 3);
    expect(saves.slots).toEqual([1, 2, 3]);
    expect(saves.save(4, data, 1)).toBe(false);
    expect(saves.save(0, data, 1)).toBe(false);
    expect(storage.data.size).toBe(0);
  });

  it('uszkodzony wpis w magazynie = pusty slot', () => {
    const storage = memoryStorage();
    const saves = new SaveStorage(storage);
    saves.save(1, data, 1);
    for (const key of storage.data.keys()) storage.data.set(key, '{"version":1');
    expect(saves.load(1)).toBeNull();
  });

  it('przy zablokowanym magazynie zapis trzyma się w pamięci sesji', () => {
    const saves = new SaveStorage(blocked);
    expect(saves.save(1, data, 1)).toBe(false);
    expect(saves.load(1)?.runSeed).toBe(7);
    saves.remove(1);
    expect(saves.load(1)).toBeNull();
    const none = new SaveStorage(null);
    none.save('auto', data, 1);
    expect(none.load('auto')?.floor).toBe(2);
  });
});
