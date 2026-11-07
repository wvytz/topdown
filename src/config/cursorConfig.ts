import { HeroId } from '@/core/heroTypes';

/** Kursory myszy nad grą (krok 172, kursory bohaterów — krok 178). Obrazki: tools/cursor_sprites.py → public/assets/cursor/. */
export enum GameCursor {
  Crosshair = 'crosshair',
  Sword = 'sword',
  Bow = 'bow',
}

export interface CursorSprite {
  /** Gorący punkt w pikselach CSS obrazka 32x32 — taki sam, jaki wypisuje generator. */
  readonly hotspot: { readonly x: number; readonly y: number };
}

export const CURSOR_SPRITES: Readonly<Record<GameCursor, CursorSprite>> = {
  [GameCursor.Crosshair]: { hotspot: { x: 16, y: 16 } },
  // Mieczyk i łuk celują czubkiem ostrza i grotem strzały (lewy górny róg), jak strzałka systemu.
  [GameCursor.Sword]: { hotspot: { x: 4, y: 4 } },
  [GameCursor.Bow]: { hotspot: { x: 4, y: 4 } },
};

/** Kursor poza walką (menu, wybór bohatera, ekrany wyników). */
export const DEFAULT_CURSOR = GameCursor.Crosshair;

/** Kursor w grze zależnie od bohatera (w co-opie — bohatera P1, który gra myszą). */
export const HERO_CURSOR: Readonly<Record<HeroId, GameCursor>> = {
  [HeroId.Barbarian]: GameCursor.Sword,
  [HeroId.Sorceress]: GameCursor.Crosshair,
  [HeroId.Archer]: GameCursor.Bow,
};
