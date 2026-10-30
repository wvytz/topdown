import { describe, expect, it } from 'vitest';
import { channelGains, cyclePreset, parseAudioSettings, stepVolume, toggleMute, volumeLabel } from '@/systems/AudioSettings';
import { MusicPreset } from '@/core/audioTypes';
import { AUDIO_SETTINGS_RULES } from '@/config/audioConfig';

const { defaults } = AUDIO_SETTINGS_RULES;

describe('AudioSettings (krok 116)', () => {
  it('pierwsze uruchomienie — gra wyciszona (krok 120)', () => {
    expect(defaults.muted).toBe(true);
    expect(channelGains(defaults)).toEqual({ music: 0, sfx: 0 });
  });

  it('zepsute dane z magazynu — wartości domyślne', () => {
    expect(parseAudioSettings(null, defaults)).toEqual(defaults);
    expect(parseAudioSettings({ music: 'głośno', sfx: 3, muted: 1 }, defaults)).toEqual({ ...defaults, sfx: 1 });
    expect(parseAudioSettings({ music: 0.3, sfx: 0, muted: true }, defaults)).toEqual({ ...defaults, music: 0.3, sfx: 0, muted: true });
  });

  it('krok głośności w zakresie 0..1, bez błędów zaokrągleń, zdejmuje wyciszenie', () => {
    const s = { ...defaults, music: 0.2, sfx: 0.95, muted: true };
    expect(stepVolume(s, 'music', 1, AUDIO_SETTINGS_RULES)).toEqual({ ...s, music: 0.3, muted: false });
    expect(stepVolume(s, 'sfx', 1, AUDIO_SETTINGS_RULES).sfx).toBe(1);
    expect(stepVolume(s, 'music', -5, AUDIO_SETTINGS_RULES).music).toBe(0);
    expect(volumeLabel(stepVolume(s, 'music', 1, AUDIO_SETTINGS_RULES).music)).toBe('30%');
  });

  it('wyciszenie zeruje oba kanały; głośność rośnie z kwadratem suwaka', () => {
    expect(channelGains(toggleMute({ ...defaults, music: 1, sfx: 1, muted: false }))).toEqual({ music: 0, sfx: 0 });
    expect(channelGains({ ...defaults, music: 0.5, sfx: 1, muted: false })).toEqual({ music: 0.25, sfx: 1 });
  });
});

describe('zestaw muzyki (krok 139)', () => {
  it('domyślnie Lucent; zapisany Horror wraca, nieznany zestaw — domyślny', () => {
    const { presets } = AUDIO_SETTINGS_RULES;
    expect(defaults.preset).toBe(MusicPreset.Lucent);
    expect(parseAudioSettings({ ...defaults, preset: 'horror' }, defaults, presets).preset).toBe(MusicPreset.Horror);
    expect(parseAudioSettings({ ...defaults, preset: 'disco' }, defaults, presets).preset).toBe(MusicPreset.Lucent);
    expect(parseAudioSettings({ music: 0.3 }, defaults, presets).preset).toBe(MusicPreset.Lucent);
  });

  it('przełączanie zawija się w obie strony i nie rusza głośności', () => {
    const horror = cyclePreset(defaults, AUDIO_SETTINGS_RULES, 1);
    expect(horror).toEqual({ ...defaults, preset: MusicPreset.Horror });
    expect(cyclePreset(horror, AUDIO_SETTINGS_RULES, 1).preset).toBe(MusicPreset.Lucent);
    expect(cyclePreset(defaults, AUDIO_SETTINGS_RULES, -1).preset).toBe(MusicPreset.Horror);
  });
});
