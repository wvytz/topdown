import { describe, expect, it } from 'vitest';
import { HeroId } from '@/core/heroTypes';
import { HERO_SPRITES_V2, HERO_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';

// Kroki U5a–U5b: postacie 2.0 dokładają klatki, ale nie zmieniają komórki (pivot, ciało fizyczne bez zmian).
const PAIRS = [
  { hero: HeroId.Barbarian, old: SPRITE_SHEETS.barbarian, v2: SPRITE_SHEETS.barbarianV2 },
  { hero: HeroId.Sorceress, old: SPRITE_SHEETS.sorceress, v2: SPRITE_SHEETS.sorceressV2 },
  { hero: HeroId.Archer, old: SPRITE_SHEETS.archer, v2: SPRITE_SHEETS.archerV2 },
] as const;

describe('postacie 2.0 (kroki U5a–U5b)', () => {
  it.each(PAIRS)('arkusz 2.0 ($hero) ma tę samą komórkę co stary, a dotychczasowe animacje te same klatki', ({ old, v2 }) => {
    expect([v2.frameWidth, v2.frameHeight]).toEqual([old.frameWidth, old.frameHeight]);
    const columns = v2.sheetWidth / v2.frameWidth;
    for (const anim of Object.values(v2.animations)) {
      for (const frame of anim.frames) expect(frame).toBeLessThan(columns);
    }
    // Chód, ciosy, rzut i łuk w tych samych kolumnach — czas ataku i chwila trafienia bez zmian (bezruch wolno zmienić).
    const oldAnimations: Record<string, { frames: readonly number[] }> = old.animations;
    const newAnimations: Record<string, { frames: readonly number[] }> = v2.animations;
    for (const [name, anim] of Object.entries(oldAnimations)) {
      if (name === 'idle') continue;
      expect(newAnimations[name]?.frames).toEqual(anim.frames);
    }
  });

  it.each(PAIRS)('wyłącznik wybiera arkusz ($hero), a nowe stany wskazują istniejące animacje', ({ hero }) => {
    const visual = HERO_VISUALS[hero];
    expect(visual.sheet.endsWith('V2')).toBe(HERO_SPRITES_V2);
    const animations: Record<string, unknown> = SPRITE_SHEETS[visual.sheet].animations;
    for (const name of [visual.move, visual.idle, visual.attack, visual.channel, visual.hurt, visual.dash, visual.death]) {
      if (name !== undefined) expect(animations[name]).toBeDefined();
    }
  });
});
