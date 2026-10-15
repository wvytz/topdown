import type { KeyValueStorage } from '@/persistence/HighscoreStorage';

const NAME_KEY = 'tower-crawler.player-name.v1';

/** Zapamiętane imię gracza do kolejnych runów. Bez magazynu pamięta je do końca sesji. */
export class PlayerName {
  private memory: string | null = null;

  constructor(private readonly storage: KeyValueStorage | null) {}

  load(): string | null {
    if (!this.storage) return this.memory;
    try {
      return this.storage.getItem(NAME_KEY) || null;
    } catch {
      return this.memory;
    }
  }

  save(name: string): void {
    this.memory = name;
    try {
      this.storage?.setItem(NAME_KEY, name);
    } catch {
      // Zablokowany magazyn — imię zostaje w pamięci.
    }
  }
}
