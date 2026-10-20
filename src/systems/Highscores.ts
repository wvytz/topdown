/** Tablica wyników — czysta logika rankingu (zapis/odczyt jest osobno, w persistence/). */

export interface ScoreEntry {
  /** Wynik = złoto w chwili śmierci. */
  readonly score: number;
  readonly floor: number;
  /** Znacznik czasu (ms) — tylko informacyjnie, ranking go nie używa. */
  readonly timestamp: number;
  /** Imię gracza; brak = wpis anonimowy (także wszystkie wpisy sprzed imion). */
  readonly name?: string;
  /**
   * Bohater runu (`HeroId`, krok 89). Brak = wpis sprzed oznaczeń; nieznana wartość (np. bohater z nowszej wersji gry)
   * zostaje w danych, ale ekran śmierci jej nie oznacza.
   */
  readonly hero?: string;
}

export interface RankedEntry {
  readonly rank: number;
  readonly entry: ScoreEntry;
  readonly isCurrent: boolean;
}

/** Skrócony widok na ekran śmierci: podium + (opcjonalnie) bieżący run pod nim. */
export interface ScoreboardView {
  readonly top: readonly RankedEntry[];
  /** Bieżący run, jeśli nie zmieścił się w `top`; null, gdy jest na podium. */
  readonly current: RankedEntry | null;
}

/** Ujemny = `a` jest lepszy. Najpierw wynik, przy remisie wyższe piętro. */
export function compareScores(a: ScoreEntry, b: ScoreEntry): number {
  return b.score - a.score || b.floor - a.floor;
}

/**
 * Wstawia wynik do posortowanej listy. Przy pełnym remisie nowy wpis ląduje za starszymi
 * (wcześniejszy rekord zachowuje miejsce). Zwraca miejsce (od 1) — także gdy wpis wypada
 * poza `maxEntries` i nie zostaje zapisany.
 */
export function insertScore(
  entries: readonly ScoreEntry[],
  entry: ScoreEntry,
  maxEntries: number,
): { entries: ScoreEntry[]; rank: number } {
  const sorted = [...entries].sort(compareScores);
  const index = sorted.findIndex((existing) => compareScores(entry, existing) < 0);
  const position = index === -1 ? sorted.length : index;
  sorted.splice(position, 0, entry);
  return { entries: sorted.slice(0, Math.max(0, maxEntries)), rank: position + 1 };
}

/** Buduje widok: `topCount` najlepszych + bieżący run, jeśli jest niżej. */
export function buildScoreboard(
  entries: readonly ScoreEntry[],
  current: { entry: ScoreEntry; rank: number },
  topCount: number,
): ScoreboardView {
  const sorted = [...entries].sort(compareScores);
  const top: RankedEntry[] = sorted.slice(0, topCount).map((entry, i) => ({
    rank: i + 1,
    entry,
    isCurrent: i + 1 === current.rank,
  }));
  const onPodium = current.rank <= topCount;
  return {
    top,
    current: onPodium ? null : { rank: current.rank, entry: current.entry, isCurrent: true },
  };
}

/** Dozwolony znak imienia: litery (także polskie), cyfry, spacja, „_” i „-”. */
export function isNameChar(char: string): boolean {
  return /^[\p{L}\p{N} _-]$/u.test(char);
}

/** Czyści imię gracza: tylko dozwolone znaki, pojedyncze spacje, bez spacji na brzegach, max `maxLength`. */
export function sanitizePlayerName(raw: string, maxLength: number): string {
  const kept = [...raw].filter(isNameChar).join('');
  return [...kept.replace(/\s+/g, ' ').trim()].slice(0, maxLength).join('').trim();
}
