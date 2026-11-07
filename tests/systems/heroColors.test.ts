import { describe, expect, it } from 'vitest';
import { COLOR_ROLE_STYLE, HERO_COLOR_DIM, HERO_HUES, HERO_PICK_COUNTS } from '@/config/heroColorConfig';
import { HeroId } from '@/core/heroTypes';
import { colorRoles, heroColors, hslToHex, toCss } from '@/systems/HeroColors';

describe('barwy klas (krok 181)', () => {
  it('HSL → hex', () => {
    expect(hslToHex(0, 1, 0.5)).toBe(0xff0000);
    expect(hslToHex(120, 1, 0.5)).toBe(0x00ff00);
    expect(toCss(0x0000ff)).toBe('#0000ff');
  });

  it('role 60-30-10 idą za udziałem w wyborach', () => {
    expect(colorRoles({ [HeroId.Barbarian]: 15, [HeroId.Sorceress]: 10, [HeroId.Archer]: 4 })).toEqual({
      [HeroId.Barbarian]: 'dominant',
      [HeroId.Sorceress]: 'secondary',
      [HeroId.Archer]: 'accent',
    });
    expect(colorRoles({ [HeroId.Barbarian]: 1, [HeroId.Sorceress]: 2, [HeroId.Archer]: 9 })[HeroId.Archer]).toBe('dominant');
  });

  it('odcienie to triada, a akcent jest najbardziej nasycony', () => {
    const [a = 0, b = 0, c = 0] = Object.values(HERO_HUES).sort((x, y) => x - y);
    expect(b - a).toBe(120);
    expect(c - b).toBe(120);
    expect(COLOR_ROLE_STYLE.accent.saturation).toBeGreaterThan(COLOR_ROLE_STYLE.dominant.saturation);
    const colors = heroColors(HERO_PICK_COUNTS, HERO_HUES, COLOR_ROLE_STYLE, HERO_COLOR_DIM);
    expect(colors[HeroId.Archer].role).toBe('accent');
    expect(colors[HeroId.Barbarian].share).toBeCloseTo(15 / 29);
    expect(colors[HeroId.Sorceress].css).toMatch(/^#[0-9a-f]{6}$/);
  });
});
