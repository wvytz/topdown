import { BossId } from '@/core/bossTypes';
import type { SpriteSheetId } from '@/config/spriteConfig';

/**
 * Oprawa walki z bossem (krok U6, `docs/UPGRADE.md`): karta wejścia bossa i widoczne fazy na pasku HP.
 * Same obrazy — liczby walk (HP, progi, ataki) zostają w `bossConfig.ts`.
 */

/**
 * Karta wejścia bossa: przy przebudzeniu przez ekran przejeżdża pas z portretem, imieniem i tytułem
 * (zastępuje dawną planszę z napisem; okrzyk wściekłości dalej daje plansza). Walka trwa w tym czasie —
 * karta nie zatrzymuje gry, więc stoi wysoko nad środkiem kadru i szybko znika.
 * `enabled: false` (albo `?bossCard=0`) przywraca planszę sprzed upgradu.
 */
export const BOSS_INTRO_CARD = {
  enabled: true,
  /** Wjazd pasa i portretu, czas na pełnym ekranie, zjazd (ms). */
  inMs: 320,
  holdMs: 1900,
  outMs: 420,
  /** Portret wychodzi z sylwetki w barwie pasa po tym ułamku czasu wjazdu (odsłonięcie). */
  revealAt: 1,
  /** Jedna klatka błysku przy odsłonięciu (pomijana przy „mniej błysków”). */
  revealFlashMs: 60,
  /** Pas: środek w pionie, wysokość (px HUD 960×540) — w dolnej części kadru, nad paskiem HP bossa; bohater stoi w środku, a boss zwykle nad nim. */
  bandY: 392,
  bandHeight: 84,
  /** Pas wjeżdża rozciągając się od środka; treść przesuwa się o tyle pikseli w poziomie. */
  slidePx: 60,
  /** Portret: skala klatki arkusza i odstęp drugiego portretu duetu. */
  portraitScale: 2,
  portraitGapPx: 84,
  /** Lewa krawędź tekstu względem środka ekranu i odstęp portretu od tekstu. */
  textOffsetX: -70,
  portraitOffsetX: -150,
  colors: {
    band: 0x0c0a0e,
    bandAlpha: 0.82,
    /** Krawędzie pasa: czerwień ekranu startowego i ciemniejszy popiół pod nią. */
    edge: 0x9a2020,
    edgeInner: 0x3a2a26,
    silhouette: 0x2a0d0f,
    name: '#efe4d2',
    title: '#d0503c',
    caption: '#8f7f72',
  },
  /** Podpis nad imieniem. */
  caption: 'BOSS',
  captionDuet: 'BOSSOWIE',
} as const;

/**
 * Progi faz bossa (wściekłość, ucieczka windą, wejście partnera). Krok U7h (ocena właściciela: „nie
 * informujmy gracza o fazach, jest to zbyt transparentne”) — HUD ich nie pokazuje; zostają dane o progach.
 */
export const BOSS_PHASE_MARKS = {
  /** Progi bliżej końca paska niż to (ułamek HP) są pomijane. */
  minGap: 0.04,
} as const;

/**
 * Błysk pazurów smagnięcia (krok U6; ocena właściciela po kroku 27: „animacja smagnięcia słabo widoczna”):
 * w chwili uderzenia przed bossem przelatują trzy łuki pazurów nad mrokiem. Komórka arkusza ma środek
 * `aheadPx` przed bossem (w arkuszu królowa stoi 26 px za środkiem komórki). Tylko obraz — strefa i obrażenia
 * bez zmian.
 */
export const BOSS_LASH_FX: Readonly<Partial<Record<BossId, { readonly sheet: SpriteSheetId; readonly animation: string; readonly aheadPx: number }>>> = {
  [BossId.SpiderQueen]: { sheet: 'spiderQueenLashFx', animation: 'slash', aheadPx: 26 },
};
