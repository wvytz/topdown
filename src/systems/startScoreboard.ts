import type { ScoreComparator, ScoreEntry } from '@/systems/Highscores';
import { isSameEntry } from '@/systems/Highscores';

/**
 * Mała tablica wyników na ekranie startowym (krok 93): kilka najlepszych wpisów, najlepszy własny wynik
 * i informacja, że ktoś go wyprzedził od ostatniego oglądania. „Własny” = wpis z lokalnej listy tej przeglądarki.
 */

export interface StartBoardRow {
  readonly rank: number;
  readonly entry: ScoreEntry;
  readonly isOwn: boolean;
}

/** Ostatnio oglądane miejsce najlepszego własnego wpisu (`timestamp` go rozpoznaje); null = poza listą. */
export interface SeenRank {
  readonly timestamp: number;
  readonly rank: number | null;
}

export interface StartBoardView {
  readonly top: readonly StartBoardRow[];
  /** Najlepszy własny wpis, gdy jest na liście poza `top`; null — w `top`, poza listą albo brak. */
  readonly own: StartBoardRow | null;
  /** Do zapamiętania jako ostatnio oglądane; null — brak własnych wpisów. */
  readonly seen: SeenRank | null;
  /** Ten sam rekord spadł od ostatniego oglądania: z miejsca `from` na `to` (null = wypadł z listy). */
  readonly overtaken: { readonly from: number; readonly to: number | null } | null;
}

/**
 * Widok tablicy: `entries` — lista (wspólna albo lokalna), `ownEntries` — wpisy tej przeglądarki
 * (pusta lista = bez oznaczania własnych, np. gdy pokazujemy samą listę lokalną).
 */
export function buildStartBoard(
  entries: readonly ScoreEntry[],
  ownEntries: readonly ScoreEntry[],
  topCount: number,
  compare: ScoreComparator,
  lastSeen: SeenRank | null,
): StartBoardView {
  const sorted = [...entries].sort(compare);
  const isOwn = (entry: ScoreEntry): boolean => ownEntries.some((own) => isSameEntry(own, entry));
  const top = sorted.slice(0, topCount).map((entry, i) => ({ rank: i + 1, entry, isOwn: isOwn(entry) }));

  const best = [...ownEntries].sort(compare)[0];
  if (best === undefined) return { top, own: null, seen: null, overtaken: null };
  const index = sorted.findIndex((entry) => isSameEntry(entry, best));
  const rank = index === -1 ? null : index + 1;
  const own = rank !== null && rank > topCount ? { rank, entry: sorted[index]!, isOwn: true } : null;
  const dropped =
    lastSeen !== null && lastSeen.timestamp === best.timestamp && lastSeen.rank !== null && (rank === null || rank > lastSeen.rank);
  return {
    top,
    own,
    seen: { timestamp: best.timestamp, rank },
    overtaken: dropped ? { from: lastSeen.rank!, to: rank } : null,
  };
}

/** Ton wiersza — scena dobiera kolor. */
export type StartBoardTone = 'title' | 'item' | 'own' | 'dim' | 'warn';

export interface StartBoardLine {
  readonly text: string;
  readonly tone: StartBoardTone;
}

export interface StartBoardText {
  readonly empty: string;
  readonly ownPrefix: string;
  readonly overtaken: (from: number, to: number | null) => string;
}

/** Wartość wiersza: na tablicy aren arena przed złotem (to ona decyduje o miejscu). */
export function startBoardValue(entry: ScoreEntry, arenas: boolean): string {
  return arenas ? `arena ${entry.floor} · ${entry.score} zł` : `${entry.score} zł · piętro ${entry.floor}`;
}

/** Wiersze jednej sekcji: nagłówek, `top`, własny wynik spoza `top` i ostrzeżenie o wyprzedzeniu. */
export function startBoardLines(view: StartBoardView, title: string, arenas: boolean, text: StartBoardText): StartBoardLine[] {
  const lines: StartBoardLine[] = [{ text: title, tone: 'title' }];
  const rows = view.own ? [...view.top, view.own] : view.top;
  // Imiona wyrównane do najdłuższego w sekcji, żeby wyniki stały w jednej kolumnie.
  const nameWidth = Math.max(0, ...rows.map((row) => [...nameOf(row.entry)].length));
  const format = (row: StartBoardRow, prefix = ''): string =>
    `${prefix}${row.rank}. ${padEnd(nameOf(row.entry), nameWidth)}  ${startBoardValue(row.entry, arenas)}`;
  if (view.top.length === 0) lines.push({ text: text.empty, tone: 'dim' });
  for (const row of view.top) lines.push({ text: format(row), tone: row.isOwn ? 'own' : 'item' });
  if (view.own) lines.push({ text: format(view.own, text.ownPrefix), tone: 'own' });
  if (view.overtaken) lines.push({ text: text.overtaken(view.overtaken.from, view.overtaken.to), tone: 'warn' });
  return lines;
}

const nameOf = (entry: ScoreEntry): string => entry.name ?? '—';
/** `padEnd` liczący znaki, nie jednostki UTF-16 (polskie litery to i tak jedna jednostka, ale na wszelki wypadek). */
const padEnd = (s: string, width: number): string => s + ' '.repeat(Math.max(0, width - [...s].length));
