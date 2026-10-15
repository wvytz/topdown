import { describe, expect, it } from 'vitest';
import { HeroId } from '@/core/heroTypes';
import { HERO_DEFINITIONS, HERO_ORDER, parseHeroId } from '@/config/heroConfig';
import { cycleIndex, heroStatLine, initialIndex } from '@/systems/heroSelect';

describe('ekran wyboru bohatera', () => {
  it('karty obejmują każdego bohatera dokładnie raz', () => {
    expect([...HERO_ORDER].sort()).toEqual([...Object.values(HeroId)].sort());
  });

  it('każdy bohater ma imię, hasło i opis LPM oraz PPM', () => {
    for (const id of HERO_ORDER) {
      const hero = HERO_DEFINITIONS[id];
      expect(hero.name.length).toBeGreaterThan(0);
      expect(hero.tagline.length).toBeGreaterThan(0);
      expect(hero.attacks.map((a) => a.input)).toEqual(['LPM', 'PPM']);
    }
  });

  it('strzałki zawijają się na końcach', () => {
    expect(cycleIndex(0, 1, 2)).toBe(1);
    expect(cycleIndex(1, 1, 2)).toBe(0);
    expect(cycleIndex(0, -1, 2)).toBe(1);
    expect(cycleIndex(0, 1, 0)).toBe(0);
  });

  it('na starcie zaznaczony ostatni wybór, bez niego pierwsza karta', () => {
    expect(initialIndex(HERO_ORDER, HeroId.Sorceress)).toBe(HERO_ORDER.indexOf(HeroId.Sorceress));
    expect(initialIndex(HERO_ORDER, null)).toBe(0);
  });

  it('linia statystyk pokazuje życie i chód', () => {
    expect(heroStatLine(HERO_DEFINITIONS[HeroId.Sorceress])).toBe('ŻYCIE 75 · CHÓD 175');
  });

  it('parseHeroId rozpoznaje tylko znanych bohaterów', () => {
    expect(parseHeroId('sorceress')).toBe(HeroId.Sorceress);
    expect(parseHeroId('barbarian')).toBe(HeroId.Barbarian);
    expect(parseHeroId('x')).toBeNull();
    expect(parseHeroId(null)).toBeNull();
  });
});
