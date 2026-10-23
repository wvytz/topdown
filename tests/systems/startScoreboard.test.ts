import { describe, expect, it } from 'vitest';
import type { ScoreEntry } from '@/systems/Highscores';
import { compareArenaScores, compareScores } from '@/systems/Highscores';
import { buildStartBoard, startBoardLines } from '@/systems/startScoreboard';
import { MENU_SCORES } from '@/config/menuConfig';

const e = (score: number, floor: number, timestamp: number, name?: string): ScoreEntry => ({ score, floor, timestamp, ...(name ? { name } : {}) });

const ala = e(900, 5, 1, 'Ala');
const ola = e(700, 4, 2, 'Ola');
const ewa = e(500, 3, 3, 'Ewa');
const wicio = e(300, 3, 4, 'Wicio');

describe('tablica na ekranie startowym (krok 93)', () => {
  it('pokazuje top N w porządku tablicy i oznacza własne wpisy', () => {
    const view = buildStartBoard([ewa, ala, ola], [ola], 3, compareScores, null);
    expect(view.top.map((r) => r.entry.name)).toEqual(['Ala', 'Ola', 'Ewa']);
    expect(view.top.map((r) => r.isOwn)).toEqual([false, true, false]);
    expect(view.own).toBeNull();
    expect(view.seen).toEqual({ timestamp: 2, rank: 2 });
  });

  it('własny rekord spoza top N dochodzi osobnym wierszem', () => {
    const view = buildStartBoard([ala, ola, ewa, wicio], [wicio], 3, compareScores, null);
    expect(view.own).toEqual({ rank: 4, entry: wicio, isOwn: true });
  });

  it('bez własnych wpisów (sama lista lokalna) nie ma oznaczeń ani pamięci miejsca', () => {
    const view = buildStartBoard([ala, ola], [], 3, compareScores, { timestamp: 1, rank: 1 });
    expect(view.top.every((r) => !r.isOwn)).toBe(true);
    expect(view).toMatchObject({ own: null, seen: null, overtaken: null });
  });

  it('ten sam rekord niżej niż ostatnio = ktoś go wyprzedził', () => {
    const view = buildStartBoard([ala, ola, ewa], [ola], 3, compareScores, { timestamp: 2, rank: 1 });
    expect(view.overtaken).toEqual({ from: 1, to: 2 });
  });

  it('nowy, lepszy własny rekord nie jest „wyprzedzeniem”, nawet gdy stary był wyżej', () => {
    const better = e(800, 4, 9, 'Wicio');
    const view = buildStartBoard([ala, better, ola], [wicio, better], 3, compareScores, { timestamp: 4, rank: 1 });
    expect(view.overtaken).toBeNull();
    expect(view.seen).toEqual({ timestamp: 9, rank: 2 });
  });

  it('rekord, który wypadł z listy: miejsce null i ostrzeżenie', () => {
    const view = buildStartBoard([ala, ola], [wicio], 3, compareScores, { timestamp: 4, rank: 2 });
    expect(view.seen).toEqual({ timestamp: 4, rank: null });
    expect(view.overtaken).toEqual({ from: 2, to: null });
    // Kolejne wejście: rekord dalej poza listą — bez ponownego ostrzeżenia.
    expect(buildStartBoard([ala, ola], [wicio], 3, compareScores, view.seen).overtaken).toBeNull();
  });

  it('awans albo to samo miejsce nie ostrzega', () => {
    expect(buildStartBoard([ala, ola], [ola], 3, compareScores, { timestamp: 2, rank: 3 }).overtaken).toBeNull();
    expect(buildStartBoard([ala, ola], [ola], 3, compareScores, { timestamp: 2, rank: 2 }).overtaken).toBeNull();
  });

  it('tablica aren: dalsza arena przed większym złotem', () => {
    const view = buildStartBoard([e(900, 2, 1, 'A'), e(10, 6, 2, 'B')], [], 3, compareArenaScores, null);
    expect(view.top.map((r) => r.entry.name)).toEqual(['B', 'A']);
  });

  it('wiersze: nagłówek, wyrównane imiona, własny wynik, ostrzeżenie', () => {
    const view = buildStartBoard([ala, ola, ewa, wicio], [wicio], 2, compareScores, { timestamp: 4, rank: 2 });
    const lines = startBoardLines(view, 'WSPINACZKA', false, MENU_SCORES.text);
    expect(lines).toEqual([
      { text: 'WSPINACZKA', tone: 'title' },
      { text: '1. Ala    900 zł · piętro 5', tone: 'item' },
      { text: '2. Ola    700 zł · piętro 4', tone: 'item' },
      { text: 'Ty: 4. Wicio  300 zł · piętro 3', tone: 'own' },
      { text: '▼ ktoś cię wyprzedził: 2. → 4.', tone: 'warn' },
    ]);
  });

  it('wiersze aren i pusta tablica', () => {
    const arenas = startBoardLines(buildStartBoard([e(120, 4, 1)], [], 3, compareArenaScores, null), 'ARENY', true, MENU_SCORES.text);
    expect(arenas[1]).toEqual({ text: '1. —  arena 4 · 120 zł', tone: 'item' });
    const empty = startBoardLines(buildStartBoard([], [], 3, compareScores, null), 'ARENY', true, MENU_SCORES.text);
    expect(empty).toEqual([
      { text: 'ARENY', tone: 'title' },
      { text: MENU_SCORES.text.empty, tone: 'dim' },
    ]);
  });
});
