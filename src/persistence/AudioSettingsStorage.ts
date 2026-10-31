import type { AudioSettings } from '@/core/audioTypes';
import { AUDIO_SETTINGS_RULES, AUDIO_STORAGE_KEY } from '@/config/audioConfig';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import { parseAudioSettings } from '@/systems/AudioSettings';

/** Głośność muzyki i efektów oraz wyciszenie (krok 116). Bez magazynu — do końca sesji. */
export class AudioSettingsStorage {
  private memory: AudioSettings = AUDIO_SETTINGS_RULES.defaults;

  constructor(private readonly storage: KeyValueStorage | null) {}

  load(): AudioSettings {
    if (!this.storage) return this.memory;
    try {
      const raw = this.storage.getItem(AUDIO_STORAGE_KEY);
      return raw === null ? this.memory : parseAudioSettings(JSON.parse(raw), AUDIO_SETTINGS_RULES.defaults, AUDIO_SETTINGS_RULES.presets);
    } catch {
      return this.memory;
    }
  }

  save(settings: AudioSettings): void {
    this.memory = settings;
    try {
      this.storage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Zablokowany magazyn — ustawienia zostają w pamięci.
    }
  }
}
