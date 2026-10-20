import type { HeroDefinition } from '@/core/heroTypes';
import { HeroId } from '@/core/heroTypes';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { PLAYER_COMBAT } from '@/config/combatConfig';

/**
 * Bohaterowie (krok 37). Barbarzyńca to dotychczasowy gracz.
 * Czarodziejka (decyzja właściciela): mniej HP i wolniejszy chód w zamian za walkę z dystansu;
 * LPM — kule energii, PPM — ciągły promień spowalniający ją samą, z blokadą po puszczeniu.
 * Łucznik (krok 82): łuk z naciąganiem na LPM i salwa na PPM; przedmioty strzału są jego bronią główną.
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
    kit: { kind: 'melee' },
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
    kit: {
      kind: 'sorcery',
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
  },
  [HeroId.Archer]: {
    id: HeroId.Archer,
    name: 'Łucznik',
    tagline: 'Szybki, celny, przebija na wylot',
    attacks: [
      { input: 'LPM', text: 'łuk (przytrzymaj: mocniej)' },
      { input: 'PPM', text: 'salwa 3 strzał' },
    ],
    // Krok 82: HP między barbarzyńcą a Czarodziejką, najszybszy chód.
    stats: { maxHp: 85, moveSpeed: 215 },
    combat: {
      ...PLAYER_COMBAT,
      // Ładunki salwy (PPM): Kołczan dokłada kolejne; każda strzała wachlarza zadaje `damage`.
      // Krok 88: 8 → 7, tyle co strzał barbarzyńcy.
      ranged: {
        damage: 7,
        knockback: 110,
        projectileSpeed: 480,
        projectileLifetimeMs: 550,
        projectileRadius: 4,
        maxCharges: 2,
        rechargeMs: 2200,
        shotIntervalMs: 300,
      },
    },
    kit: {
      kind: 'archery',
      archery: {
        bow: {
          // Kliknięcie: słaba strzała; pełne naciągnięcie (0,9 s): mocna, szybsza, przebijająca.
          // Krok 87 (feedback właściciela: łucznik za mocny): obrażenia −25% (5/24 → 4/18), wolniejszy LPM (naciąg 0,7 → 0,9 s, przerwa 0,25 → 0,4 s).
          // Krok 88 (wyrównanie bohaterów): pełne naciągnięcie 18 → 14, jak kula Czarodziejki (cios barbarzyńcy 12); kliknięcie 4 → 3.
          minDamage: 3,
          maxDamage: 14,
          minKnockback: 60,
          maxKnockback: 200,
          minSpeed: 380,
          maxSpeed: 620,
          lifetimeMs: 600,
          radius: 4,
          drawMs: 900,
          cooldownMs: 400,
          fullDrawPierce: 1,
          moveSpeedMultiplier: 0.6,
          forwardOffset: 14,
          sideOffset: -3,
        },
        volley: { arrows: 3, spreadDeg: 30 },
      },
    },
  },
};

export const DEFAULT_HERO = HeroId.Barbarian;

/** Kolejność kart na ekranie wyboru (od lewej). */
export const HERO_ORDER: readonly HeroId[] = [HeroId.Barbarian, HeroId.Sorceress, HeroId.Archer];

/** Rozpoznaje identyfikator bohatera (parametr adresu, zapis w przeglądarce); nieznany = null. */
export function parseHeroId(value: string | null): HeroId | null {
  return Object.values(HeroId).find((id) => id === value) ?? null;
}
