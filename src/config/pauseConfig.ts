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
    items: 'Moje przedmioty',
    save: 'Zapisz grę',
    settings: 'Dźwięk i obraz',
    controls: 'Sterowanie',
    feedback: '💬 Napisz do autora',
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
  pageTitles: { save: 'ZAPIS GRY', settings: 'DŹWIĘK I OBRAZ', controls: 'STEROWANIE', items: 'MOJE PRZEDMIOTY' },
  saveUnavailable: 'Zapis niedostępny podczas odtwarzania nagrania',
  /** Podpowiedź na dole: strona główna i podstrony. */
  hints: {
    main: '↑ ↓ wybór · Enter — OK · Esc — wznów',
    sub: '↑ ↓ wybór · Enter — OK · Esc — wróć',
    settings: '← → głośność, styl i jakość · Enter — zmień · Esc — wróć',
  },
  /** Układ (y w pikselach płótna 960×540). */
  layout: {
    panel: { width: 680, top: 28, bottom: 512, color: 0x0f0e18, alpha: 0.9, border: 0x573e38 },
    titleY: 76,
    subtitleY: 116,
    itemsY: 176,
    itemStep: 38,
    /** Krok U1: „Dźwięk i obraz” ma do 9 pozycji — gęstsza lista, żeby zmieściła się nad komunikatem. */
    settingsItemStep: 30,
    itemFontSize: 20,
    slotFontSize: 14,
    volumeButtonDx: 150,
    controlsY: 140,
    controlsItemsY: 430,
    noteGap: 14,
    statusY: 452,
    hintY: 488,
  },
  /** Krok 162: strona „Moje przedmioty” — pod tytułem, nad „Wróć” (controlsItemsY). */
  build: {
    top: 104,
    width: 600,
    /** Co-op: dwie kolumny. */
    columnWidth: 300,
    columnGap: 24,
    sectionGap: 22,
    titleSize: 13,
    detailSize: 11,
    /** Krok U7: ikona przedmiotu (16×16) przed nazwą, opis wcięty pod nią. */
    indent: 22,
    rowGap: 6,
    /** Solo: od tylu przedmiotów lista idzie w dwóch kolumnach. */
    splitAfter: 6,
    /** Odstęp od „Wróć”. */
    bottomGap: 22,
    empty: 'Jeszcze nic — przedmioty dają wrogowie, skrzynie, kapliczki i bossowie.',
  },
  /** Strona „Sterowanie” (PC): klawiatura z myszą, pad i skróty w pauzie. */
  controls: [
    'KLAWIATURA I MYSZ',
    'WASD — ruch · LPM / PPM — ataki',
    'Spacja — dash · R — ultimate · E — kapliczka, schody',
    'N — dźwięk · F — pełny ekran · F9 — raport błędów',
    'Enter — napisz do autora (pomysł, błąd, zażalenie)',
    '',
    'PAD',
    'Lewa gałka — ruch · prawa — cel · X / B (RT / LT) — ataki',
    'A — dash · Y — E · RB — ultimate · Start — pauza',
    '',
    'SKRÓTY W PAUZIE',
    '1 / 2 / 3 — zapis · M — menu główne · O — wypełnij okno',
  ],
  /**
   * Krok 130 (uwaga testera): po „Wznów” gra nie rusza od razu — plansza stoi widoczna pod jasną nakładką
   * i odlicza 3-2-1, żeby gracz przypomniał sobie sytuację. Esc / P / Start w trakcie wraca do pauzy.
   */
  countdown: {
    steps: 3,
    // Krok 161 (uwaga testera: „3, 2, 1 wkurzające”): krok 1,0 → 0,6 s, a kliknięcie / Enter / A pomija odliczanie.
    stepMs: 600,
    maxFrameMs: 100,
    minSkipMs: 120,
    /** Nakładka w czasie odliczania — dużo lżejsza niż w pauzie, żeby było widać planszę. */
    overlayAlpha: 0.22,
    fontSize: 96,
    color: '#f0d27a',
    /** Cyfra na początku kroku jest większa i maleje do 1 (puls). */
    pulseScale: 1.5,
    /** Pod koniec kroku cyfra blednie do tej przezroczystości. */
    fadeAlpha: 0.35,
    caption: 'Przygotuj się…  (klik — od razu)',
    /** Cyfra nad bohaterem (kamera trzyma go na środku) — nie zasłania jego okolicy. */
    y: 140,
    captionDy: 70,
  },
  /** Wersja mobilna (krok 96): opis dotyku zamiast klawiszy; wszystko się stuka. */
  mobile: {
    controls: [
      'Lewa część ekranu — gałka ruchu (idzie za kciukiem)',
      'Duże kółko — atak od razu, celuje sam',
      'przeciągnij kółko w stronę celu — celujesz ty',
      'STRZAŁ / PROMIEŃ / SALWA — przeciągnij lub stuknij',
      'ZRYW — dash · E — kapliczka, schody',
      'SZAŁ / NOVA / TOTEM — ultimate (gdy pasek mocy pełny)',
    ],
    hint: 'Stuknij pozycję',
  },
} as const;

/** Klucz zegara pauzy w rejestrze gry (Phaser `game.registry`). */
export const PAUSE_CLOCK_KEY = 'pauseClock';

export type PauseReason = 'manual' | 'focus';
