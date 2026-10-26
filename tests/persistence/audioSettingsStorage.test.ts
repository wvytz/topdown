import { describe, expect, it } from 'vitest';
import { AUDIO_SETTINGS_RULES, AUDIO_STORAGE_KEY } from '@/config/audioConfig';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import { AudioSettingsStorage } from '@/persistence/AudioSettingsStorage';

describe('AudioSettingsStorage (krok 116)', () => {
  it('pierwsze uruchomienie — wartości domyślne; zapis przetrwa nową instancję', () => {
    const data = new Map<string, string>();
    const storage: KeyValueStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    expect(new AudioSettingsStorage(storage).load()).toEqual(AUDIO_SETTINGS_RULES.defaults);
    new AudioSettingsStorage(storage).save({ music: 0.2, sfx: 0.9, muted: true });
    expect(new AudioSettingsStorage(storage).load()).toEqual({ music: 0.2, sfx: 0.9, muted: true });
  });

  it('zepsuty JSON i zablokowany magazyn nie psują gry', () => {
    const broken: KeyValueStorage = { getItem: (k) => (k === AUDIO_STORAGE_KEY ? '{nie json' : null), setItem: () => undefined };
    expect(new AudioSettingsStorage(broken).load()).toEqual(AUDIO_SETTINGS_RULES.defaults);
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = new AudioSettingsStorage(blocked);
    store.save({ music: 0, sfx: 0.1, muted: false });
    expect(store.load()).toEqual({ music: 0, sfx: 0.1, muted: false });
  });
});
