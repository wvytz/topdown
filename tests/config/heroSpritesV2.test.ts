import { describe, expect, it } from 'vitest';
import { HeroId } from '@/core/heroTypes';
import { HERO_SPRITES_V2, HERO_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';

// Krok U5a: postacie 2.0 dokładają klatki, ale nie zmieniają komórki (pivot, ciało fizyczne bez zmian).
describe('postacie 2.0 (krok U5a)', () => {
  it('arkusz 2.0 barbarzyńcy ma tę samą komórkę co stary i wszystkie klatki w arkuszu', () => {
    const old = SPRITE_SHEETS.barbarian;
    const v2 = SPRITE_SHEETS.barbarianV2;
    expect([v2.frameWidth, v2.frameHeight]).toEqual([old.frameWidth, old.frameHeight]);
    const columns = v2.sheetWidth / v2.frameWidth;
    for (const anim of Object.values(v2.animations)) {
      for (const frame of anim.frames) expect(frame).toBeLessThan(columns);
    }
    // Chód i cios w tych samych kolumnach co dotąd — czas ciosu i chwila trafienia bez zmian.
    expect(v2.animations.walk.frames).toEqual(old.animations.walk.frames);
    expect(v2.animations.attack.frames).toEqual(old.animations.attack.frames);
  });

  it('wyłącznik wybiera arkusz, a nowe stany wskazują istniejące animacje', () => {
    const visual = HERO_VISUALS[HeroId.Barbarian];
    expect(visual.sheet).toBe(HERO_SPRITES_V2 ? 'barbarianV2' : 'barbarian');
    const animations: Record<string, unknown> = SPRITE_SHEETS[visual.sheet].animations;
    for (const name of [visual.move, visual.idle, visual.attack, visual.hurt, visual.dash, visual.death]) {
      if (name !== undefined) expect(animations[name]).toBeDefined();
    }
  });
});
