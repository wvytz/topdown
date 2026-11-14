/**
 * Filtr wulgaryzmów w imieniu gracza (krok U9b): imię trafia na wspólną tablicę wyników, którą widzą wszyscy.
 * Rdzenie porównujemy po normalizacji (małe litery, bez ogonków, cyfry jak litery, bez powtórzeń liter i separatorów),
 * więc „KuRRw4”, „k_u_r_w_a” i „ĆHUJ” też odpadają. Rdzenie dobrane tak, by nie łapać zwykłych imion.
 */
export interface NameFilterConfig {
  /** Zakazane rdzenie (zapis zwykły — normalizacja jest w `systems/NameFilter.ts`). */
  readonly blockedRoots: readonly string[];
  /** Cyfry i znaki podobne do liter (leetspeak). */
  readonly lookalikes: Readonly<Record<string, string>>;
}

export const NAME_FILTER_CONFIG: NameFilterConfig = {
  blockedRoots: [
    // polskie
    'kurw', 'chuj', 'huj', 'pierdol', 'pierdal', 'jeba', 'jebi', 'jebn', 'jebl', 'pizd', 'cipa', 'cipk', 'kutas', 'fiut',
    'dziwk', 'szmata', 'pedal', 'ciota', 'cwel', 'skurw', 'zjeb', 'wypierd', 'spierd', 'jebac',
    // angielskie
    'fuck', 'fuk', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'bitch', 'whore', 'slut', 'pussy', 'penis', 'vagina',
    // nienawiść
    'hitler', 'nazi', 'heilh',
  ],
  lookalikes: { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i' },
};

/** Napisy okienka zmiany imienia (krok U9b) — w pauzie, „Dźwięk i obraz”. */
export const NAME_BOX_TEXT = {
  title: 'Imię na tablicy wyników',
  intro: 'Tak podpiszesz się na tablicy wyników i w wiadomościach do autora. Puste pole — bez imienia.',
  save: 'Zapisz',
  cancel: 'Anuluj',
  rejected: 'Tego imienia nie da się użyć — wybierz inne.',
  pauseItem: (name: string | null): string => `Imię: ${name ?? '—'}`,
  /** Podpowiedź pada w okienku. */
  padHint: 'Pad: A — zapisz · B — anuluj',
} as const;
