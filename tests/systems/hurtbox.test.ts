import { describe, expect, it } from 'vitest';
import { HERO_HURTBOX, PROJECTILE_RADIUS } from '@/config/combatConfig';
import { HERO_VISUALS } from '@/config/spriteConfig';
import { PLAYER_SIZE } from '@/config/gameConfig';
import { heroGroundPoint, isCaughtByGroundArea, isTouchingHeroBody } from '@/systems/Hurtbox';

const HERO = { x: 100, y: 100 };

describe('strefa trafienia bohatera (krok 110)', () => {
  it('ślad stóp leży w środku cienia każdego bohatera', () => {
    for (const visual of Object.values(HERO_VISUALS)) {
      expect(heroGroundPoint(HERO)).toEqual({ x: HERO.x + 0, y: HERO.y + visual.groundShadow.offsetY });
    }
  });

  it('strefa na ziemi łapie dopiero, gdy jej brzeg sięga śladu stóp', () => {
    const { offsetY, radius } = HERO_HURTBOX.ground;
    const foot = { x: HERO.x, y: HERO.y + offsetY };
    // Koło z lewej: brzeg dokładnie na krawędzi śladu — trafia; piksel dalej — nie.
    expect(isCaughtByGroundArea({ x: foot.x - 60 - radius, y: foot.y }, 60, HERO)).toBe(true);
    expect(isCaughtByGroundArea({ x: foot.x - 61 - radius, y: foot.y }, 60, HERO)).toBe(false);
  });

  it('ślad stóp jest mniejszy niż połowa ciała fizycznego (stara reguła łapała o 12 px za obrysem)', () => {
    expect(HERO_HURTBOX.ground.radius).toBeLessThan(PLAYER_SIZE / 2);
    // Gracz, którego środek stoi 10 px za obrysem koła, nie dostaje już obrażeń.
    expect(isCaughtByGroundArea({ x: HERO.x - 70, y: HERO.y + HERO_HURTBOX.ground.offsetY }, 60, HERO)).toBe(false);
  });

  it('postać stojąca nad kołem (stopy przy brzegu) jest bliżej strefy niż stojąca pod nim', () => {
    const below = { x: HERO.x, y: HERO.y + 68 };
    const above = { x: HERO.x, y: HERO.y - 68 };
    expect(isCaughtByGroundArea(below, 60, HERO)).toBe(true);
    expect(isCaughtByGroundArea(above, 60, HERO)).toBe(false);
  });

  it('pocisk trafia tułów, a nie róg prostokąta fizyki', () => {
    const touch = PROJECTILE_RADIUS + HERO_HURTBOX.body.radius;
    expect(isTouchingHeroBody({ x: HERO.x + touch, y: HERO.y }, PROJECTILE_RADIUS, HERO)).toBe(true);
    expect(isTouchingHeroBody({ x: HERO.x + touch + 1, y: HERO.y }, PROJECTILE_RADIUS, HERO)).toBe(false);
    // Róg 24×24 (12, 12) przy pocisku 4 px — kiedyś trafienie, teraz pudło.
    expect(isTouchingHeroBody({ x: HERO.x + 13, y: HERO.y + 13 }, PROJECTILE_RADIUS, HERO)).toBe(false);
  });
});
