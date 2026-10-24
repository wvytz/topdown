import type { HeroDefinition } from '@/core/heroTypes';
import { HeroId } from '@/core/heroTypes';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { PLAYER_COMBAT } from '@/config/combatConfig';

/**
 * Bohaterowie (krok 37). Barbarzyńca to dotychczasowy gracz.
 * Czarodziejka (decyzja właściciela): mniej HP i wolniejszy chód w zamian za walkę z dystansu;
 * LPM — kule energii, PPM — ciągły promień spowalniający ją samą, z blokadą po puszczeniu.
 * Łucznik (krok 82): łuk na LPM i salwa na PPM; przedmioty strzału są jego bronią główną.
 * Krok 97 (raport testera: barbarzyńca tnie bez przerwy przy trzymanym LPM, a pozostali nie): przytrzymanie LPM
 * daje ciągły atak każdym bohaterem — seria kul z falą uderzeniową u Czarodziejki, ostrzał bez naciągania u łucznika.
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
      { input: 'LPM', text: 'kule energii; po 3. fala uderzeniowa' },
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
          // Krok 97: seria 3 kul, przy ostatniej fala; potem wszystkie wracają po 0,6 s (wcześniej po jednej co 1,5 s).
          rechargeMs: 900,
          reloadMs: 600,
          nova: { radius: 56, damage: 16, knockback: 240 },
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
        // Krok 97 (raport testera: promień za słaby): 5 → 8 na tick (40/s), dłuższy i szerszy,
        // trwa do 3 s, blokada 1,5 → 1 s, mniejsze spowolnienie (0,5 → 0,6).
        beam: {
          range: 170,
          halfWidth: 5,
          damagePerTick: 8,
          tickMs: 200,
          knockback: 25,
          moveSpeedMultiplier: 0.6,
          maxChannelMs: 3000,
          lockoutMs: 1000,
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
      { input: 'LPM', text: 'ostrzał; co 3. strzała przebija' },
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
          // Krok 97 (prośba właściciela po raporcie testera): bez naciągania — przytrzymanie LPM strzela w kółko
          // co 0,34 s; co 3. strzała serii mocna i przebija. Ok. 29 obrażeń/s w jeden cel (cios barbarzyńcy 12/0,32 s
          // ≈ 37/s, ale wręcz i łukiem); wcześniej pełne naciągnięcie 14 co 1,3 s ≈ 11/s.
          damage: 8,
          knockback: 110,
          speed: 520,
          strongDamage: 14,
          strongKnockback: 200,
          strongSpeed: 620,
          strongPierce: 1,
          strongEvery: 3,
          lifetimeMs: 600,
          radius: 4,
          intervalMs: 340,
          moveSpeedMultiplier: 0.8,
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
