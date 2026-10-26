import { describe, expect, it } from 'vitest';
import { HERO_ORDER } from '@/config/heroConfig';
import { HeroId } from '@/core/heroTypes';
import { DEFAULT_COOP_DEVICES } from '@/systems/coopDevices';
import { freshCoop, partnerHero } from '@/systems/Coop';

describe('Coop (co-op, etap C2: drugi bohater)', () => {
  it('bohaterowie muszą być różni: ten sam wybór przechodzi na następnego', () => {
    expect(partnerHero(HeroId.Barbarian, HeroId.Archer, HERO_ORDER)).toBe(HeroId.Archer);
    expect(partnerHero(HeroId.Barbarian, HeroId.Barbarian, HERO_ORDER)).toBe(HeroId.Sorceress);
    expect(partnerHero(HeroId.Archer, HeroId.Archer, HERO_ORDER)).toBe(HeroId.Barbarian);
  });

  it('jeden bohater w puli to błąd', () => {
    expect(() => partnerHero(HeroId.Archer, HeroId.Archer, [HeroId.Archer])).toThrow();
  });

  it('nowy run co-op: partner bez przedmiotów, pełne HP, P1 klawiatura, P2 pad', () => {
    expect(freshCoop(HeroId.Sorceress)).toEqual({ partner: { hero: HeroId.Sorceress, items: [], hp: null }, devices: DEFAULT_COOP_DEVICES });
    expect(DEFAULT_COOP_DEVICES[0]).toEqual({ keyboard: true, mouse: true, pad: null });
    expect(DEFAULT_COOP_DEVICES[1]).toEqual({ keyboard: false, mouse: false, pad: 'any' });
  });
});
