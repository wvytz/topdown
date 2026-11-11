import { describe, expect, it } from 'vitest';
import { scopeStorage, storagePrefixFromEnv } from '@/persistence/scopedStorage';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('scopeStorage (krok U0: podgląd w podkatalogu)', () => {
  it('pusty przedrostek zwraca ten sam magazyn — główna gra bez zmian', () => {
    const raw = memoryStorage();
    expect(scopeStorage(raw, '')).toBe(raw);
  });

  it('podgląd zapisuje pod własnymi kluczami i nie widzi danych głównej gry', () => {
    const raw = memoryStorage();
    raw.setItem('tower-crawler.save.v1', 'główna');
    const preview = scopeStorage(raw, 'upgrade:');
    expect(preview.getItem('tower-crawler.save.v1')).toBeNull();
    preview.setItem('tower-crawler.save.v1', 'podgląd');
    expect(raw.getItem('tower-crawler.save.v1')).toBe('główna');
    expect(raw.getItem('upgrade:tower-crawler.save.v1')).toBe('podgląd');
    preview.removeItem('tower-crawler.save.v1');
    expect(raw.data.has('upgrade:tower-crawler.save.v1')).toBe(false);
    expect(raw.getItem('tower-crawler.save.v1')).toBe('główna');
  });

  it('przedrostek z buildu: tylko bezpieczne znaki', () => {
    expect(storagePrefixFromEnv('upgrade:')).toBe('upgrade:');
    expect(storagePrefixFromEnv(undefined)).toBe('');
    expect(storagePrefixFromEnv('')).toBe('');
    expect(storagePrefixFromEnv('zły prefiks')).toBe('');
    expect(storagePrefixFromEnv(42)).toBe('');
  });
});
