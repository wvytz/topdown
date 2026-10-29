/**
 * Czat „Napisz do autora” (krok 133, pomysł właściciela): Enter w grze (albo pozycja w pauzie, także na padzie
 * i telefonie) otwiera okienko, w którym tester pisze, co go gryzie — pomysł, błąd albo zażalenie. Wiadomość
 * trafia do workera jako zgłoszenie `feedback` (bez kasowania po 30 dniach), a autor czyta ją w skrzynce
 * `/inbox` i przyznaje gwiazdki do ukrytej tablicy współtwórców.
 */
export const FEEDBACK_CONFIG = {
  /** Klawisz otwierający okienko w grze (`KeyboardEvent.key`). */
  key: 'Enter',
  /** Długość wiadomości (znaki po przycięciu spacji). */
  minChars: 2,
  maxChars: 600,
  /** Najwyżej tyle pustych linii pod rząd — reszta jest zwijana. */
  maxBlankLines: 1,
  /** Limity po stronie gry: odstęp między wiadomościami i liczba na sesję (worker ma własne). */
  minIntervalMs: 10_000,
  maxPerSession: 12,
} as const;

export const FEEDBACK_TEXT = {
  title: 'Napisz do autora',
  intro: 'Co cię gryzie? Pomysł, błąd, zażalenie — każda wiadomość trafia prosto do autora.',
  placeholder: 'Np. „Boss na 4. piętrze bije za mocno” albo „dodajcie mapę świata”…',
  send: 'Wyślij',
  cancel: 'Zamknij',
  /** Podpowiedź pod polem: PC (klawiatura i pad) i telefon. */
  hint: 'Enter — wyślij · Shift+Enter — nowa linia · Esc — zamknij',
  padHint: 'Pad: A — wyślij · B — zamknij (pisz z klawiatury)',
  mobileHint: 'Napisz i stuknij „Wyślij”',
  signedAs: (name: string) => `Podpisano: ${name}`,
  anonymous: 'Bez imienia — wpisz je na tablicy wyników, żeby autor wiedział, kto pisze',
  sending: 'Wysyłam…',
  sent: 'Dzięki! Wiadomość trafiła do autora.',
  duplicate: 'Ta wiadomość już dotarła — dzięki!',
  tooShort: 'Napisz choć kilka słów.',
  throttled: (s: number) => `Chwila — następna wiadomość za ${s} s.`,
  sessionLimit: 'Na tę sesję wystarczy — dzięki za tyle uwag!',
  failed: 'Nie udało się wysłać (brak sieci?). Tekst został — spróbuj za chwilę.',
  unavailable: 'Wysyłka niedostępna w tej wersji gry.',
  /** Pozycja w menu pauzy. */
  pauseItem: 'Napisz do autora',
} as const;
