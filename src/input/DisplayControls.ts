import type { DisplaySettings } from '@/core/displayTypes';
import { DISPLAY_CONFIG } from '@/config/displayConfig';
import { diag } from '@/diagnostics/DiagnosticsHub';
import { DisplaySettingsStorage } from '@/persistence/DisplaySettingsStorage';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import { isFullscreenKeyPress, toggleFillWindow } from '@/systems/DisplaySettings';

/**
 * Wielkość obrazu na PC (krok 118): „Wypełnij okno” (zapamiętane) i pełny ekran przeglądarki.
 * Pełny ekran prosi o całą stronę (nie samo płótno) — skala płótna liczy się wtedy od nowa, jak po zmianie okna.
 */
export class DisplayControls {
  private settingsValue: DisplaySettings;
  private readonly watchers = new Set<() => void>();

  constructor(private readonly storage: DisplaySettingsStorage) {
    this.settingsValue = storage.load();
  }

  get settings(): DisplaySettings {
    return this.settingsValue;
  }

  get fullscreen(): boolean {
    return typeof document !== 'undefined' && document.fullscreenElement !== null;
  }

  /** Obserwator zmian (ustawienia albo pełny ekran); zwraca funkcję odpinającą. */
  watch(watcher: () => void): () => void {
    this.watchers.add(watcher);
    return () => this.watchers.delete(watcher);
  }

  toggleFillWindow(): void {
    this.settingsValue = toggleFillWindow(this.settingsValue);
    this.storage.save(this.settingsValue);
    diag.note('display-fill', { fillWindow: this.settingsValue.fillWindow });
    this.notify();
  }

  /** Przełącza pełny ekran; zwraca, czy przeglądarka przyjęła prośbę (wymaga gestu gracza — pad się nie liczy). */
  async toggleFullscreen(): Promise<boolean> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      return true;
    } catch {
      return false;
    }
  }

  /** Klawisz F na całej stronie (tylko PC) i odświeżenie obserwatorów po wejściu/wyjściu z pełnego ekranu. */
  install(target: Window): void {
    target.addEventListener('keydown', (event) => {
      if (!isFullscreenKeyPress(event, DISPLAY_CONFIG.fullscreenKey, isTypingTarget(event.target))) return;
      void this.toggleFullscreen();
    });
    target.document.addEventListener('fullscreenchange', () => {
      diag.note('display-fullscreen', { on: this.fullscreen });
      this.notify();
    });
  }

  private notify(): void {
    for (const watcher of this.watchers) watcher();
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export const display = new DisplayControls(new DisplaySettingsStorage(HighscoreStorage.browserStorage()));
