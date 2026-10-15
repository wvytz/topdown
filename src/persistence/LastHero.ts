import type { HeroId } from '@/core/heroTypes';
import { parseHeroId } from '@/config/heroConfig';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';

const HERO_KEY = 'tower-crawler.last-hero.v1';

/** Ostatnio wybrany bohater — ekran wyboru zaznacza go na starcie. Bez magazynu pamięta do końca sesji. */
export class LastHero {
  private memory: HeroId | null = null;

  constructor(private readonly storage: KeyValueStorage | null) {}

  load(): HeroId | null {
    if (!this.storage) return this.memory;
    try {
      return parseHeroId(this.storage.getItem(HERO_KEY)) ?? this.memory;
    } catch {
      return this.memory;
    }
  }

  save(hero: HeroId): void {
    this.memory = hero;
    try {
      this.storage?.setItem(HERO_KEY, hero);
    } catch {
      // Zablokowany magazyn — wybór zostaje w pamięci.
    }
  }
}
