import type { AudioSettings } from '@/core/audioTypes';

/** Krok suwaka głośności i wartości domyślne. */
export interface AudioSettingsRules {
  readonly defaults: AudioSettings;
  readonly step: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
/** Zaokrąglenie do setnych — żeby 0,1 + 0,2 nie dawało 0,30000000000000004 na ekranie pauzy. */
const round = (value: number): number => Math.round(value * 100) / 100;

/** Ustawienia z magazynu: nieznane lub zepsute pola zastępują wartości domyślne. */
export function parseAudioSettings(raw: unknown, defaults: AudioSettings): AudioSettings {
  if (typeof raw !== 'object' || raw === null) return defaults;
  const data = raw as Record<string, unknown>;
  const volume = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? round(clamp01(value)) : fallback;
  return {
    music: volume(data.music, defaults.music),
    sfx: volume(data.sfx, defaults.sfx),
    muted: typeof data.muted === 'boolean' ? data.muted : defaults.muted,
  };
}

/** Zmiana głośności muzyki albo efektów o `steps` kroków (ujemne — ciszej). Zmiana głośności zdejmuje wyciszenie. */
export function stepVolume(settings: AudioSettings, channel: 'music' | 'sfx', steps: number, rules: AudioSettingsRules): AudioSettings {
  return { ...settings, [channel]: round(clamp01(settings[channel] + steps * rules.step)), muted: false };
}

export function toggleMute(settings: AudioSettings): AudioSettings {
  return { ...settings, muted: !settings.muted };
}

/**
 * Wzmocnienie kanałów: suwak liniowy, ucho logarytmiczne — kwadrat suwaka daje równiejsze kroki głośności.
 * Wyciszenie zeruje oba kanały.
 */
export function channelGains(settings: AudioSettings): { readonly music: number; readonly sfx: number } {
  if (settings.muted) return { music: 0, sfx: 0 };
  return { music: settings.music * settings.music, sfx: settings.sfx * settings.sfx };
}

/** Napis głośności na ekranie pauzy, np. „70%”. */
export function volumeLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}
