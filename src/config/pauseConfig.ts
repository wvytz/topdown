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
  /**
   * Krok 120 (prośba właściciela: „za dużo tekstu”): pauza to krótkie menu, a zapis, dźwięk z obrazem
   * i sterowanie leżą na podstronach (`systems/pauseMenu.ts`).
   */
  items: {
    resume: 'Wznów',
    save: 'Zapisz grę',
    settings: 'Dźwięk i obraz',
    controls: 'Sterowanie',
    quit: 'Menu główne',
    back: 'Wróć',
    mute: (muted: boolean) => `Dźwięk: ${muted ? 'WYCISZONY' : 'WŁĄCZONY'}`,
  },
  /** Jedna szara linijka pod listą — tylko przy pozycjach, które jej potrzebują. */
  notes: {
    save: 'Stan z wejścia na piętro',
    quit: 'Autozapis zostaje — „Kontynuuj” w menu',
    /** Krok 121: w walce z bossem nie ma zapisu — inaczej wyjście dawałoby darmową powtórkę walki. */
    quitBossFight: 'Walka z bossem — bez zapisu, wyjście kończy run',
  },
  pageTitles: { save: 'ZAPIS GRY', settings: 'DŹWIĘK I OBRAZ', controls: 'STEROWANIE' },
  saveUnavailable: 'Zapis niedostępny podczas odtwarzania nagrania',
  /** Podpowiedź na dole: strona główna i podstrony. */
  hints: {
    main: '↑ ↓ wybór · Enter — OK · Esc — wznów',
    sub: '↑ ↓ wybór · Enter — OK · Esc — wróć',
    settings: '← → głośność · Enter — zmień · Esc — wróć',
  },
  /** Układ (y w pikselach płótna 960×540). */
  layout: {
    panel: { width: 680, top: 28, bottom: 512, color: 0x0c0c16, alpha: 0.85, border: 0x5a4a2a },
    titleY: 76,
    subtitleY: 116,
    itemsY: 176,
    itemStep: 38,
    itemFontSize: 20,
    slotFontSize: 14,
    volumeButtonDx: 150,
    controlsY: 140,
    controlsItemsY: 430,
    noteGap: 14,
    statusY: 452,
    hintY: 488,
  },
  /** Strona „Sterowanie” (PC): klawiatura z myszą, pad i skróty w pauzie. */
  controls: [
    'KLAWIATURA I MYSZ',
    'WASD — ruch · LPM / PPM — ataki',
    'Spacja — dash · R — ultimate · E — kapliczka, schody',
    'N — dźwięk · F — pełny ekran · F9 — raport błędów',
    '',
    'PAD',
    'Lewa gałka — ruch · prawa — cel · X / B (RT / LT) — ataki',
    'A — dash · Y — E · RB — ultimate · Start — pauza',
    '',
    'SKRÓTY W PAUZIE',
    '1 / 2 / 3 — zapis · M — menu główne · O — wypełnij okno',
  ],
  /** Wersja mobilna (krok 96): opis dotyku zamiast klawiszy; wszystko się stuka. */
  mobile: {
    controls: [
      'Lewa część ekranu — gałka ruchu',
      'Duże kółko — atak: przeciągnij w stronę celu',
      'stuknij lub przytrzymaj — celuje sam',
      'STRZAŁ / PROMIEŃ / SALWA (nad kółkiem) — tak samo',
      'ZRYW — dash · E — kapliczka, schody',
      'SZAŁ / NOVA / TOTEM — ultimate (gdy pasek mocy pełny)',
    ],
    hint: 'Stuknij pozycję',
  },
} as const;

/** Klucz zegara pauzy w rejestrze gry (Phaser `game.registry`). */
export const PAUSE_CLOCK_KEY = 'pauseClock';

export type PauseReason = 'manual' | 'focus';
