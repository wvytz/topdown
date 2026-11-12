import { META_CONFIG } from '@/config/metaConfig';
import { browserLocalStorage } from '@/persistence/scopedStorage';
import type { ScopedStorage } from '@/persistence/scopedStorage';
import type { MetaProfile } from '@/systems/MetaProgress';
import { parseMetaProfile } from '@/systems/MetaProgress';

/** Trwały profil w magazynie przeglądarki (krok Z1). Bez magazynu profil żyje do końca sesji. */
export class MetaStorage {
  private memory: MetaProfile | null = null;

  constructor(private readonly storage: ScopedStorage | null) {}

  static browser(): MetaStorage {
    return new MetaStorage(browserLocalStorage());
  }

  /** Zawsze świeży odczyt: profil zmieniają różne sceny (gra, Popielnik, menu), każda z własnym obiektem. */
  load(): MetaProfile {
    if (!this.storage) return this.memory ?? parseMetaProfile(null);
    try {
      return parseMetaProfile(this.storage.getItem(META_CONFIG.storageKey));
    } catch {
      return this.memory ?? parseMetaProfile(null);
    }
  }

  save(profile: MetaProfile): void {
    this.memory = profile;
    try {
      this.storage?.setItem(META_CONFIG.storageKey, JSON.stringify(profile));
    } catch {
      // Zablokowany albo pełny magazyn — profil zostaje w pamięci.
    }
  }

  /** Zmienia profil funkcją i zapisuje wynik. */
  update(change: (profile: MetaProfile) => MetaProfile): MetaProfile {
    const current = this.load();
    const next = change(current);
    if (next !== current) this.save(next);
    return next;
  }
}
