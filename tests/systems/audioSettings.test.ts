import { describe, expect, it } from 'vitest';
import { channelGains, parseAudioSettings, stepVolume, toggleMute, volumeLabel } from '@/systems/AudioSettings';
import { AUDIO_SETTINGS_RULES } from '@/config/audioConfig';

const { defaults } = AUDIO_SETTINGS_RULES;

describe('AudioSettings (krok 116)', () => {
  it('zepsute dane z magazynu — wartości domyślne', () => {
    expect(parseAudioSettings(null, defaults)).toEqual(defaults);
    expect(parseAudioSettings({ music: 'głośno', sfx: 3, muted: 1 }, defaults)).toEqual({ ...defaults, sfx: 1 });
    expect(parseAudioSettings({ music: 0.3, sfx: 0, muted: true }, defaults)).toEqual({ music: 0.3, sfx: 0, muted: true });
  });

  it('krok głośności w zakresie 0..1, bez błędów zaokrągleń, zdejmuje wyciszenie', () => {
    const s = { music: 0.2, sfx: 0.95, muted: true };
    expect(stepVolume(s, 'music', 1, AUDIO_SETTINGS_RULES)).toEqual({ music: 0.3, sfx: 0.95, muted: false });
    expect(stepVolume(s, 'sfx', 1, AUDIO_SETTINGS_RULES).sfx).toBe(1);
    expect(stepVolume(s, 'music', -5, AUDIO_SETTINGS_RULES).music).toBe(0);
    expect(volumeLabel(stepVolume(s, 'music', 1, AUDIO_SETTINGS_RULES).music)).toBe('30%');
  });

  it('wyciszenie zeruje oba kanały; głośność rośnie z kwadratem suwaka', () => {
    expect(channelGains(toggleMute({ music: 1, sfx: 1, muted: false }))).toEqual({ music: 0, sfx: 0 });
    expect(channelGains({ music: 0.5, sfx: 1, muted: false })).toEqual({ music: 0.25, sfx: 1 });
  });
});
