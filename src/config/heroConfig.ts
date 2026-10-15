import type { HeroDefinition } from '@/core/heroTypes';
import { HeroId } from '@/core/heroTypes';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { PLAYER_COMBAT } from '@/config/combatConfig';

/**
 * Bohaterowie (krok 37). Barbarzyńca to dotychczasowy gracz.
 * Czarodziejka (decyzja właściciela): mniej HP i wolniejszy chód w zamian za walkę z dystansu;
 * LPM — kule energii, PPM — ciągły promień spowalniający ją samą, z blokadą po puszczeniu.
 * Liczby do strojenia w testach właściciela.
 */
export const HERO_DEFINITIONS: Readonly<Record<HeroId, HeroDefinition>> = {
  [HeroId.Barbarian]: {
    id: HeroId.Barbarian,
    name: 'Barbarzyńca',
    tagline: 'Wręcz, ciężko i z bliska',
    attacks: [
      { input: 'LPM', text: 'cios mieczem łukiem przed sobą' },
      { input: 'PPM', text: 'strzał (3 ładunki)' },
    ],
    stats: PLAYER_BASE_STATS,
    combat: PLAYER_COMBAT,
    sorcery: null,
  },
  [HeroId.Sorceress]: {
    id: HeroId.Sorceress,
    name: 'Czarodziejka',
    tagline: 'Z dystansu, kruchsza i wolniejsza',
    attacks: [
      { input: 'LPM', text: 'kule energii z orbity' },
      { input: 'PPM', text: 'promień (przytrzymaj)' },
    ],
    stats: { maxHp: 75, moveSpeed: 175 },
    combat: PLAYER_COMBAT,
    sorcery: {
      orbs: {
        damage: 14,
        knockback: 120,
        speed: 360,
        lifetimeMs: 750,
        radius: 5,
        maxOrbs: 3,
        rechargeMs: 1500,
        // Rzut trwa 4 klatki animacji; kula wylatuje w ostatniej (3/4 czasu rzutu).
        castWindupMs: 240,
        castCooldownMs: 320,
        forwardOffset: 17,
        sideOffset: 4,
        orbitRadius: 18,
        orbitPeriodMs: 1800,
        // Krok 50 (wybór właściciela, wariant 1): delikatne AoE — rozprysk 24 px, 35% obrażeń kuli dla sąsiadów.
        splash: { radius: 24, damageFraction: 0.35 },
      },
      beam: {
        range: 150,
        halfWidth: 4,
        damagePerTick: 5,
        tickMs: 200,
        knockback: 25,
        moveSpeedMultiplier: 0.5,
        maxChannelMs: 2500,
        lockoutMs: 1500,
        forwardOffset: 17,
        sideOffset: 4,
      },
    },
  },
};

export const DEFAULT_HERO = HeroId.Barbarian;

/** Kolejność kart na ekranie wyboru (od lewej). */
export const HERO_ORDER: readonly HeroId[] = [HeroId.Barbarian, HeroId.Sorceress];

/** Rozpoznaje identyfikator bohatera (parametr adresu, zapis w przeglądarce); nieznany = null. */
export function parseHeroId(value: string | null): HeroId | null {
  return Object.values(HeroId).find((id) => id === value) ?? null;
}
