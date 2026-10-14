import type { IntRange, TilePoint } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';

/** Lepkie pajęczyny na podłodze Pajęczego leża (krok 23e). Liczby w biomeConfig. */
export interface StickyWebConfig {
  /** Ile pajęczyn w zwykłym pokoju (losowane; 0 = pokój bez pajęczyn). */
  readonly perRoom: IntRange;
  /** Szansa, że pajęczyna ma 2×2 kafle zamiast 1×1. */
  readonly largeChance: number;
  /** Odstęp od ścian pokoju (kafle) — pajęczyna nie zatyka przejścia. */
  readonly wallMarginTiles: number;
  /** Środek pokoju (promień w kaflach) zostaje wolny — tam może stać kapliczka. */
  readonly centerClearTiles: number;
  /** Najmniejsza przerwa (kafle) między pajęczynami oraz między pajęczyną a kokonem. */
  readonly minGapTiles: number;
  /**
   * Spowolnienie gracza w pajęczynie, odnawiane co klatkę — `durationMs` to czas, przez który
   * nici kleją się jeszcze po wyjściu. Dash przechodzi bez spowolnienia.
   */
  readonly slow: { readonly pct: number; readonly durationMs: number };
}

/** Pajęczyna w kaflach: lewy górny róg i bok kwadratu (1 albo 2). */
export interface StickyWeb {
  readonly tile: TilePoint;
  readonly size: 1 | 2;
}

/** Przerwa między kwadratami kafli (0 = stykają się lub nachodzą), metryka Czebyszewa. */
export function webGap(a: StickyWeb, b: StickyWeb): number {
  const dx = Math.max(0, b.tile.x - (a.tile.x + a.size), a.tile.x - (b.tile.x + b.size));
  const dy = Math.max(0, b.tile.y - (a.tile.y + a.size), a.tile.y - (b.tile.y + b.size));
  return Math.max(dx, dy);
}

/** Czy punkt świata (px) leży w którejś pajęczynie — środek gracza musi wejść w nici. */
export function isInStickyWeb(webs: readonly StickyWeb[], point: Vector2, tileSize: number): boolean {
  return webs.some(
    ({ tile, size }) =>
      point.x >= tile.x * tileSize &&
      point.x < (tile.x + size) * tileSize &&
      point.y >= tile.y * tileSize &&
      point.y < (tile.y + size) * tileSize,
  );
}
