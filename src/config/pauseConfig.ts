/** Pauza (krok 70): klawisze, auto-pauza przy utracie fokusu i teksty ekranu pauzy. */
export const PAUSE_CONFIG = {
  /** Klawisze przełączające pauzę (nazwy zdarzeń Phasera `keydown-<NAZWA>`). */
  keys: ['ESC', 'P'],
  /** Parametr adresu wymuszający auto-pauzę: `?autopause=1` (włącza), `?autopause=0` (wyłącza). */
  autoPauseParam: 'autopause',
  /** Plansza: tło i napisy. */
  overlay: { color: 0x05050a, alpha: 0.72 },
  title: 'PAUZA',
  reasonText: {
    manual: 'Gra wstrzymana',
    focus: 'Gra wstrzymana — okno straciło fokus',
  },
  resumeHint: 'Esc / P / kliknięcie — wznów',
  /** Zapis gry i wyjście do menu (krok 91). */
  saveTitle: 'ZAPIS GRY — 1 / 2 / 3 (stan z wejścia na piętro)',
  saveUnavailable: 'Zapis niedostępny podczas odtwarzania nagrania',
  quitHint: 'M — menu główne (autozapis zostaje: Kontynuuj)',
  /** Układ (y w pikselach płótna 960×540). */
  layout: { titleY: 52, reasonY: 92, controlsY: 118, saveTitleY: 284, slotsY: 310, slotStep: 22, statusY: 384, quitY: 422, resumeY: 464 },
  controls: [
    'WASD — ruch',
    'LPM / PPM — ataki bohatera',
    'Spacja — dash',
    'E — kapliczka, schody',
    'F9 — raport błędów',
  ],
} as const;

/** Klucz zegara pauzy w rejestrze gry (Phaser `game.registry`). */
export const PAUSE_CLOCK_KEY = 'pauseClock';

export type PauseReason = 'manual' | 'focus';
