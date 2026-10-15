import type { HeroDefinition } from '@/core/heroTypes';
import { HeroId } from '@/core/heroTypes';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { PLAYER_COMBAT } from '@/config/combatConfig';

/**
 * Bohaterowie (krok 35). Barbarzyńca to dotychczasowy gracz.
 * Czarodziejka (decyzja właściciela): mniej HP i wolniejszy chód w zamian za walkę z dystansu;
 * LPM — kule energii, PPM — ciągły promień spowalniający ją samą, z blokadą po puszczeniu.
 * Liczby do strojenia w testach właściciela.
 */
export const HERO_DEFINITIONS: Readonly<Record<HeroId, HeroDefinition>> = {
  [HeroId.Barbarian]: {
    id: HeroId.Barbarian,
    name: 'Barbarzyńca',
    stats: PLAYER_BASE_STATS,
    combat: PLAYER_COMBAT,
    sorcery: null,
  },
  [HeroId.Sorceress]: {
    id: HeroId.Sorceress,
    name: 'Czarodziejka',
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

/** Bohater z parametru adresu (`?hero=sorceress`); nieznana wartość = domyślny. */
export function heroFromParam(value: string | null): HeroId {
  return Object.values(HeroId).find((id) => id === value) ?? DEFAULT_HERO;
}
