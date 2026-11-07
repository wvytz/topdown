import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameCursorCss } from '@/input/gameCursor';

describe('własny kursor (krok 172)', () => {
  const css = gameCursorCss('./');

  it('dotyczy tylko płótna gry i ma zapasowy celownik', () => {
    expect(css).toMatch(/^#game canvas \{/);
    expect(css.match(/, crosshair !important;/g)).toHaveLength(2);
  });

  it('wskazuje istniejące obrazki z generatora', () => {
    const files = [...css.matchAll(/url\('\.\/([^']+)'\)/g)].map((match) => match[1]);
    expect(new Set(files).size).toBe(2);
    for (const file of files) expect(existsSync(`public/${file}`), file).toBe(true);
  });
});
