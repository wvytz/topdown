import type { DisplaySettings } from '@/core/displayTypes';

/**
 * Wielkość obrazu na PC (krok 118, decyzja właściciela): pełny ekran i opcja „Wypełnij okno”.
 * Pole widzenia kamery się nie zmienia (zoom 2,0, 960×540) — tylko skala płótna na ekranie.
 */
export const DISPLAY_CONFIG = {
  /** Domyślnie ostre piksele (całkowita krotność, STYLEGUIDE §2); „Wypełnij okno” — skala ułamkowa jak na telefonie. */
  defaults: { fillWindow: false } satisfies DisplaySettings,
  /** Klawisz pełnego ekranu (działa wszędzie poza polami tekstowymi). */
  fullscreenKey: 'F',
  /** Klawisz „Wypełnij okno” na ekranie pauzy. */
  fillKey: 'O',
} as const;

/** Klucz ustawień w localStorage. */
export const DISPLAY_STORAGE_KEY = 'tower-crawler.display.v1';

export const DISPLAY_TEXT = {
  fill: (on: boolean) => `Wypełnij okno: ${on ? 'TAK' : 'NIE (ostre piksele)'}`,
  fullscreen: (on: boolean) => (on ? 'Wyjdź z pełnego ekranu' : 'Pełny ekran'),
  fullscreenFailed: 'Przeglądarka nie pozwoliła na pełny ekran — wciśnij F albo kliknij napis',
} as const;
