import type { HeroDefinition } from '@/core/heroTypes';
import { HeroId } from '@/core/heroTypes';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { PLAYER_COMBAT } from '@/config/combatConfig';
import type { PlayerCombatConfig } from '@/core/combatTypes';

/**
 * Cięższe ciosy barbarzyńcy: krok 167 jako próba `?heavy=1`, od kroku 171 domyślnie (ocena właściciela 7.11: „zostaw,
 * super jest”). Cios co 0,42 s zamiast 0,32 s, 20 obrażeń zamiast 15 (ok. 48/s jak wcześniej 47/s), drżenie kamery przy trafieniu.
 */
export const BARBARIAN_COMBAT = {
  ...PLAYER_COMBAT,
  meleeDamage: 20,
  attackCooldownMs: 420,
  hitShake: { durationMs: 70, intensity: 0.0025 },
} as const satisfies PlayerCombatConfig;

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
      { input: 'PPM', text: 'strzał naprowadzany (3 ładunki)' },
      { input: 'R', text: 'Szał: furia ciosów, nietykalny' },
    ],
    stats: PLAYER_BASE_STATS,
    combat: BARBARIAN_COMBAT,
    kit: { kind: 'melee' },
    // Krok 98 (pomysł właściciela: szał, żeby szybko dobić bossa, z nietykalnością).
    // Krok 117 (ocena właściciela: szał z przedmiotami „broken”): 5 → 4 s, ciosy ×0,65 → ×0,8, obrażenia ×1,35 → ×1,2.
    // Z pełnymi Rękawicami (czas ×1/1,6) szał dochodzi dokładnie do limitu 50% bazowego czasu ciosu (160 ms).
    ultimate: {
      kind: 'rage',
      name: 'Szał',
      durationMs: 4000,
      attackCooldownMultiplier: 0.8,
      damageMultiplier: 1.2,
      moveSpeedMultiplier: 1.2,
      invulnerable: true,
    },
    // Krok 117: barbarzyńca zabija najwięcej, więc za zabicie ładuje się wolniej (5% → 3%).
    ultimateGauge: { perKill: 0.03 },
  },
  [HeroId.Sorceress]: {
    id: HeroId.Sorceress,
    name: 'Czarodziejka',
    tagline: 'Z dystansu, kruchsza i wolniejsza',
    attacks: [
      { input: 'LPM', text: '3 kule energii, potem fala' },
      { input: 'PPM', text: 'promień (przytrzymaj)' },
      { input: 'R', text: 'Supernowa i tarcza' },
    ],
    stats: { maxHp: 75, moveSpeed: 175 },
    combat: PLAYER_COMBAT,
    kit: {
      kind: 'sorcery',
      sorcery: {
        orbs: {
          damage: 18,
          // Krok 161: odrzut ×0,6 (uwaga testera).
          knockback: 75,
          speed: 360,
          lifetimeMs: 750,
          radius: 5,
          maxOrbs: 3,
          // Krok 97: seria 3 kul, przy ostatniej fala; potem wszystkie wracają po 0,6 s (wcześniej po jednej co 1,5 s).
          rechargeMs: 900,
          reloadMs: 600,
          nova: { radius: 56, damage: 20, knockback: 240 },
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
          damagePerTick: 10,
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
    // Krok 98 (pomysł właściciela: tarcza i „gigawybuch”): wielka fala wokół niej, potem 3 s tarczy.
    ultimate: { kind: 'supernova', name: 'Supernowa', radius: 130, damage: 88, knockback: 420, shieldMs: 3000 },
  },
  [HeroId.Archer]: {
    id: HeroId.Archer,
    name: 'Łucznik',
    tagline: 'Szybki, celny, przebija na wylot',
    attacks: [
      { input: 'LPM', text: 'ostrzał, co 3. strzała mocna' },
      { input: 'PPM', text: 'salwa 3 strzał' },
      { input: 'R', text: 'Totem: wabik, który strzela' },
    ],
    // Krok 82: HP między barbarzyńcą a Czarodziejką, najszybszy chód.
    stats: { maxHp: 85, moveSpeed: 215 },
    combat: {
      ...PLAYER_COMBAT,
      // Ładunki salwy (PPM): Kołczan dokłada kolejne; każda strzała wachlarza zadaje `damage`.
      // Krok 88: 8 → 7, tyle co strzał barbarzyńcy.
      ranged: {
        damage: 9,
        knockback: 70,
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
          // Krok 145: obrażenia bohaterów ×1,25 (8/14 → 10/18, ok. 37/s; cios barbarzyńcy 15/0,32 s ≈ 47/s).
          damage: 10,
          // Krok 161: odrzut ×0,6 (uwaga testera).
          knockback: 70,
          speed: 520,
          strongDamage: 18,
          strongKnockback: 130,
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
    // Krok 98 (pomysł właściciela: totem, który przejmuje aggro): wrogowie i bossowie celują w totem, a on strzela.
    ultimate: {
      kind: 'totem',
      name: 'Totem',
      durationMs: 7000,
      shotIntervalMs: 400,
      range: 240,
      damage: 12,
      knockback: 80,
      speed: 520,
      lifetimeMs: 600,
    },
  },
};

export const DEFAULT_HERO = HeroId.Barbarian;

/** Kolejność kart na ekranie wyboru (od lewej). */
export const HERO_ORDER: readonly HeroId[] = [HeroId.Barbarian, HeroId.Sorceress, HeroId.Archer];

/**
 * Krok 167 (decyzja właściciela po uwadze testera „wywalić czarodziejkę”): Czarodziejka znika z ekranów wyboru
 * (solo i co-op), ale kod zostaje — `?hero=sorceress`, zapisy i bot-partner działają dalej.
 */
export const HIDDEN_HEROES: readonly HeroId[] = [HeroId.Sorceress];

/** Bohaterowie na ekranach wyboru (od lewej). */
export const SELECTABLE_HEROES: readonly HeroId[] = HERO_ORDER.filter((hero) => !HIDDEN_HEROES.includes(hero));

/** Rozpoznaje identyfikator bohatera (parametr adresu, zapis w przeglądarce); nieznany = null. */
export function parseHeroId(value: string | null): HeroId | null {
  return Object.values(HeroId).find((id) => id === value) ?? null;
}
