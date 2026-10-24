/**
 * Wersja gry (krok 96): PC (`index.html`) albo mobilna (`mobile.html`). Ustawiana raz, przy starcie,
 * zanim powstaną sceny. Zasady gry są wspólne — wersja decyduje tylko o sterowaniu, skali i tablicy wyników.
 */
export type PlatformId = 'pc' | 'mobile';

let current: PlatformId = 'pc';

export function setPlatform(id: PlatformId): void {
  current = id;
}

export function currentPlatform(): PlatformId {
  return current;
}
