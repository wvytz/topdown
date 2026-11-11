import type { DisplaySettings } from '@/core/displayTypes';
import { isQualityChoice } from '@/systems/RenderQuality';

/** Ustawienia z magazynu: nieznane lub zepsute pola zastępują wartości domyślne. */
export function parseDisplaySettings(raw: unknown, defaults: DisplaySettings): DisplaySettings {
  if (typeof raw !== 'object' || raw === null) return defaults;
  const data = raw as Record<string, unknown>;
  return {
    fillWindow: typeof data.fillWindow === 'boolean' ? data.fillWindow : defaults.fillWindow,
    // Krok U1: pola dopisane do tego samego klucza — stary zapis (bez nich) dostaje wartości domyślne.
    quality: isQualityChoice(data.quality) ? data.quality : defaults.quality,
    reduceFlashes: typeof data.reduceFlashes === 'boolean' ? data.reduceFlashes : defaults.reduceFlashes,
  };
}

export function toggleFillWindow(settings: DisplaySettings): DisplaySettings {
  return { ...settings, fillWindow: !settings.fillWindow };
}

/**
 * Czy klawisz ma przełączyć pełny ekran: bez modyfikatorów (Ctrl+F to wyszukiwanie w przeglądarce),
 * bez autopowtórzenia i nie w polu tekstowym (raport F9).
 */
export function isFullscreenKeyPress(
  event: { readonly key: string; readonly repeat: boolean; readonly ctrlKey: boolean; readonly altKey: boolean; readonly metaKey: boolean },
  key: string,
  typingInField: boolean,
): boolean {
  return !typingInField && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && event.key.toUpperCase() === key;
}
