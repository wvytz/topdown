import { describe, expect, it } from 'vitest';
import { DISPLAY_CONFIG } from '@/config/displayConfig';
import { isFullscreenKeyPress, parseDisplaySettings, toggleFillWindow } from '@/systems/DisplaySettings';

const key = (over: Partial<{ key: string; repeat: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({
  key: 'f',
  repeat: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...over,
});

describe('ustawienia obrazu (krok 118)', () => {
  it('domyślnie ostre piksele', () => {
    expect(DISPLAY_CONFIG.defaults.fillWindow).toBe(false);
  });

  it('zepsute dane z magazynu dają wartości domyślne', () => {
    for (const raw of [null, 'x', 5, {}, { fillWindow: 'tak' }]) {
      expect(parseDisplaySettings(raw, DISPLAY_CONFIG.defaults)).toEqual(DISPLAY_CONFIG.defaults);
    }
    expect(parseDisplaySettings({ fillWindow: true }, DISPLAY_CONFIG.defaults)).toEqual({ fillWindow: true });
  });

  it('przełącznik „Wypełnij okno” działa w obie strony', () => {
    const on = toggleFillWindow(DISPLAY_CONFIG.defaults);
    expect(on.fillWindow).toBe(true);
    expect(toggleFillWindow(on).fillWindow).toBe(false);
  });

  it('F przełącza pełny ekran (małe i wielkie), ale nie Ctrl+F, autopowtórzenie ani pisanie w polu', () => {
    expect(isFullscreenKeyPress(key(), 'F', false)).toBe(true);
    expect(isFullscreenKeyPress(key({ key: 'F' }), 'F', false)).toBe(true);
    expect(isFullscreenKeyPress(key({ ctrlKey: true }), 'F', false)).toBe(false);
    expect(isFullscreenKeyPress(key({ metaKey: true }), 'F', false)).toBe(false);
    expect(isFullscreenKeyPress(key({ repeat: true }), 'F', false)).toBe(false);
    expect(isFullscreenKeyPress(key(), 'F', true)).toBe(false);
    expect(isFullscreenKeyPress(key({ key: 'g' }), 'F', false)).toBe(false);
  });
});
