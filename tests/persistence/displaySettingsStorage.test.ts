import { describe, expect, it } from 'vitest';
import { DISPLAY_STORAGE_KEY } from '@/config/displayConfig';
import { DisplaySettingsStorage } from '@/persistence/DisplaySettingsStorage';

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe('DisplaySettingsStorage (krok 118)', () => {
  it('zapamiętuje „Wypełnij okno” między sesjami', () => {
    const storage = memoryStorage();
    new DisplaySettingsStorage(storage).save({ fillWindow: true });
    expect(new DisplaySettingsStorage(storage).load()).toEqual({ fillWindow: true });
  });

  it('zepsuty wpis i brak magazynu — domyślnie ostre piksele, ustawienie w pamięci', () => {
    const storage = memoryStorage();
    storage.setItem(DISPLAY_STORAGE_KEY, '{zepsute');
    expect(new DisplaySettingsStorage(storage).load()).toEqual({ fillWindow: false });
    const noStorage = new DisplaySettingsStorage(null);
    noStorage.save({ fillWindow: true });
    expect(noStorage.load()).toEqual({ fillWindow: true });
  });

  it('zablokowany magazyn nie przerywa gry', () => {
    const throwing = { getItem: () => { throw new Error('blokada'); }, setItem: () => { throw new Error('blokada'); } };
    const storage = new DisplaySettingsStorage(throwing);
    expect(() => storage.save({ fillWindow: true })).not.toThrow();
    expect(storage.load()).toEqual({ fillWindow: true });
  });
});
