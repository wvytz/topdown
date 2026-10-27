import type { DisplaySettings } from '@/core/displayTypes';
import { DISPLAY_CONFIG, DISPLAY_STORAGE_KEY } from '@/config/displayConfig';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import { parseDisplaySettings } from '@/systems/DisplaySettings';

/** Ustawienia obrazu (krok 118). Bez magazynu — do końca sesji. */
export class DisplaySettingsStorage {
  private memory: DisplaySettings = DISPLAY_CONFIG.defaults;

  constructor(private readonly storage: KeyValueStorage | null) {}

  load(): DisplaySettings {
    if (!this.storage) return this.memory;
    try {
      const raw = this.storage.getItem(DISPLAY_STORAGE_KEY);
      return raw === null ? this.memory : parseDisplaySettings(JSON.parse(raw), DISPLAY_CONFIG.defaults);
    } catch {
      return this.memory;
    }
  }

  save(settings: DisplaySettings): void {
    this.memory = settings;
    try {
      this.storage?.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Zablokowany magazyn — ustawienia zostają w pamięci.
    }
  }
}
