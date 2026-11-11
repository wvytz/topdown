/**
 * Osobny magazyn dla podglądu z podkatalogu (krok U0): podgląd gałęzi `upgrade-fable` leży pod
 * `wvytz.github.io/topdown/upgrade/`, czyli w tym samym pochodzeniu (origin) co gra testerów — i ma ten sam
 * `localStorage`. Bez przedrostka podgląd nadpisywałby zapisy, lokalne tablice i ustawienia głównej gry.
 *
 * Przedrostek podaje build (`VITE_STORAGE_PREFIX`, ustawia go `npm run deploy:pages -- --subdir …`);
 * w głównej grze jest pusty i magazyn przeglądarki działa bez zmian.
 */
export type ScopedStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Magazyn z kluczami poprzedzonymi `prefix`; pusty przedrostek zwraca magazyn bez zmian. */
export function scopeStorage(storage: ScopedStorage, prefix: string): ScopedStorage {
  if (prefix === '') return storage;
  return {
    getItem: (key) => storage.getItem(prefix + key),
    setItem: (key, value) => storage.setItem(prefix + key, value),
    removeItem: (key) => storage.removeItem(prefix + key),
  };
}

/** Przedrostek z buildu (tylko litery, cyfry, „-”, „:” i „.”; inne wartości są ignorowane). */
export function storagePrefixFromEnv(value: unknown): string {
  return typeof value === 'string' && /^[a-z0-9.:-]{1,32}$/i.test(value) ? value : '';
}

/** `localStorage` przeglądarki z przedrostkiem podglądu, jeśli jest dostępny. */
export function browserLocalStorage(): ScopedStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return scopeStorage(window.localStorage, storagePrefixFromEnv(import.meta.env.VITE_STORAGE_PREFIX));
  } catch {
    return null;
  }
}
