import { HERO_HURTBOX } from '@/config/combatConfig';
import type { Vector2 } from '@/core/types';

/**
 * Trafienia bohatera według tego, co widać na ekranie (krok 110), a nie według prostokąta fizyki 24×24.
 * Strefy na ziemi łapią ślad stóp (środek cienia), pociski — tułów.
 */

/** Środek śladu stóp bohatera (pod środkiem ciała, tam gdzie jego cień). */
export function heroGroundPoint(hero: Vector2): Vector2 {
  return { x: hero.x, y: hero.y + HERO_HURTBOX.ground.offsetY };
}

/** Czy koło na ziemi (`center`, `radius`) przykrywa ślad stóp bohatera. */
export function isCaughtByGroundArea(center: Vector2, radius: number, hero: Vector2): boolean {
  const foot = heroGroundPoint(hero);
  return Math.hypot(foot.x - center.x, foot.y - center.y) <= radius + HERO_HURTBOX.ground.radius;
}

/**
 * Czy bohater stoi w plamie na ziemi (teren: ogień, krok 114): środek śladu stóp leży w kole. Bez promienia stóp —
 * parzy to, na czym widać cień postaci, a zasięg plamy jest taki sam jak przed krokiem 114, tylko przy stopach.
 */
export function isStandingInGroundArea(center: Vector2, radius: number, hero: Vector2): boolean {
  const foot = heroGroundPoint(hero);
  return Math.hypot(foot.x - center.x, foot.y - center.y) <= radius;
}

/** Czy coś okrągłego w powietrzu (pocisk, skaczący dog) o promieniu `radius` dotyka tułowia bohatera. */
export function isTouchingHeroBody(at: Vector2, radius: number, hero: Vector2): boolean {
  return Math.hypot(at.x - hero.x, at.y - hero.y) <= radius + HERO_HURTBOX.body.radius;
}
