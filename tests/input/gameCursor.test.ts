import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameCursor, HERO_CURSOR } from '@/config/cursorConfig';
import { HeroId } from '@/core/heroTypes';
import { cursorFile, gameCursorCss } from '@/input/gameCursor';

describe('własny kursor (kroki 172 i 178)', () => {
  const css = gameCursorCss('./');

  it('domyślny celownik dotyczy tylko płótna gry, a każdy kursor ma zapasowy celownik', () => {
    expect(css).toMatch(/^#game canvas \{/);
    expect(css.match(/, crosshair !important;/g)).toHaveLength(2 * Object.values(GameCursor).length);
  });

  it('kursory bohaterów włącza atrybut kontenera gry', () => {
    expect(css).toContain('#game[data-cursor="sword"] canvas {');
    expect(css).toContain('#game[data-cursor="bow"] canvas {');
  });

  it('barbarzyńca ma mieczyk, łucznik łuk, Czarodziejka kostur (krok 180)', () => {
    expect(HERO_CURSOR[HeroId.Barbarian]).toBe(GameCursor.Sword);
    expect(HERO_CURSOR[HeroId.Sorceress]).toBe(GameCursor.Wand);
    expect(HERO_CURSOR[HeroId.Archer]).toBe(GameCursor.Bow);
  });

  it('wszystkie obrazki z generatora istnieją', () => {
    for (const cursor of Object.values(GameCursor)) {
      for (const hiDpi of [false, true]) expect(existsSync(`public/${cursorFile(cursor, hiDpi)}`), cursor).toBe(true);
    }
  });
});
