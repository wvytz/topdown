import type { PlayerCombatConfig } from '@/core/combatTypes';
import type { PlayerStats } from '@/core/types';

/** Grywalni bohaterowie. Wybór żyje przez cały run (RunSnapshot). */
export enum HeroId {
  Barbarian = 'barbarian',
  Sorceress = 'sorceress',
  Archer = 'archer',
}

/** Kule energii Czarodziejki (LPM): krążą wokół niej, atak wypuszcza jedną w stronę celownika. */
export interface OrbConfig {
  readonly damage: number;
  readonly knockback: number;
  readonly speed: number;
  readonly lifetimeMs: number;
  /** Promień ciała pocisku (px). */
  readonly radius: number;
  /** Kule na orbicie przy pełnej puli. */
  readonly maxOrbs: number;
  /** Odnowienie jednej pustej orbity, gdy seria nie została wyczerpana (kule wracają po jednej). */
  readonly rechargeMs: number;
  /** Krok 97: po rzucie ostatniej kuli wszystkie wracają naraz po tym czasie (przytrzymanie LPM = ciągła walka). */
  readonly reloadMs: number;
  /** Krok 97: fala uderzeniowa wokół Czarodziejki przy rzucie ostatniej kuli serii. */
  readonly nova: NovaConfig;
  /** Rzut zaklęcia: od kliknięcia do wylotu kuli (klatka 7 animacji). */
  readonly castWindupMs: number;
  /** Odstęp między kolejnymi rzutami (przytrzymanie = seria). */
  readonly castCooldownMs: number;
  /** Kula wylatuje z kryształu: tyle px przed pivotem … */
  readonly forwardOffset: number;
  /** … i tyle px w prawo od osi patrzenia (kostur trzymany po prawej). */
  readonly sideOffset: number;
  readonly orbitRadius: number;
  /** Czas jednego okrążenia kul wokół postaci. */
  readonly orbitPeriodMs: number;
  /** Rozprysk (krok 50): wrogowie w promieniu od trafienia dostają ułamek obrażeń kuli (bez efektów przedmiotów). */
  readonly splash: { readonly radius: number; readonly damageFraction: number };
}

/** Fala uderzeniowa (krok 97): magia wokół Czarodziejki, odpycha wrogów; bez efektów przedmiotów. */
export interface NovaConfig {
  readonly radius: number;
  readonly damage: number;
  readonly knockback: number;
}

/** Promień (PPM): ciągły, póki gracz trzyma przycisk; puszczenie blokuje go na `lockoutMs`. */
export interface BeamConfig {
  readonly range: number;
  /** Połowa szerokości promienia (px) — trafia cele, których krąg dotyka odcinka. */
  readonly halfWidth: number;
  readonly damagePerTick: number;
  readonly tickMs: number;
  readonly knockback: number;
  /** Mnożnik prędkości ruchu w trakcie promienia. */
  readonly moveSpeedMultiplier: number;
  /** Najdłuższy ciągły promień; potem gaśnie sam, jak po puszczeniu przycisku. */
  readonly maxChannelMs: number;
  /** Blokada po zgaśnięciu promienia. */
  readonly lockoutMs: number;
  /** Promień zaczyna się przy krysztale: tyle px przed pivotem … */
  readonly forwardOffset: number;
  /** … i tyle px w prawo od osi patrzenia. */
  readonly sideOffset: number;
}

export interface SorceryConfig {
  readonly orbs: OrbConfig;
  readonly beam: BeamConfig;
}

/**
 * Łuk (LPM, krok 97 — wcześniej naciąganie z kroku 82): przytrzymanie strzela w kółko co `intervalMs`.
 * Co `strongEvery`-ta strzała ciągłej serii jest mocna: więcej obrażeń i odrzutu, szybsza, przebija.
 */
export interface BowConfig {
  readonly damage: number;
  readonly knockback: number;
  readonly speed: number;
  readonly strongDamage: number;
  readonly strongKnockback: number;
  readonly strongSpeed: number;
  /** Dodatkowe przebicia mocnej strzały (sumują się z Szurikenem). */
  readonly strongPierce: number;
  /** Co która strzała serii jest mocna; 0 = żadna. Seria zaczyna się od nowa po puszczeniu LPM. */
  readonly strongEvery: number;
  readonly lifetimeMs: number;
  /** Promień ciała strzały (px). */
  readonly radius: number;
  /** Odstęp między strzałami przy przytrzymaniu LPM. */
  readonly intervalMs: number;
  /** Mnożnik prędkości ruchu w trakcie ostrzału (LPM przytrzymany). */
  readonly moveSpeedMultiplier: number;
  /** Strzała wylatuje z łuku: tyle px przed pivotem … */
  readonly forwardOffset: number;
  /** … i tyle px w prawo od osi patrzenia. */
  readonly sideOffset: number;
}

/** Salwa (PPM): wachlarz strzał na ładunkach strzału (`combat.ranged` — obrażenia, ładunki, odnowienie). */
export interface VolleyConfig {
  readonly arrows: number;
  /** Rozpiętość wachlarza: kąt między skrajnymi strzałami (stopnie). */
  readonly spreadDeg: number;
}

export interface ArcheryConfig {
  readonly bow: BowConfig;
  readonly volley: VolleyConfig;
}

/**
 * Zestaw broni bohatera (krok 82): wręcz i strzał (barbarzyńca), magia (Czarodziejka) albo łuk (łucznik).
 * Jedno pole zamiast osobnych `null` dla każdego bohatera.
 */
export type HeroKit =
  | { readonly kind: 'melee' }
  | { readonly kind: 'sorcery'; readonly sorcery: SorceryConfig }
  | { readonly kind: 'archery'; readonly archery: ArcheryConfig };

/** Zestaw Czarodziejki albo null. */
export function sorceryOf(kit: HeroKit): SorceryConfig | null {
  return kit.kind === 'sorcery' ? kit.sorcery : null;
}

/** Zestaw łucznika albo null. */
export function archeryOf(kit: HeroKit): ArcheryConfig | null {
  return kit.kind === 'archery' ? kit.archery : null;
}

/**
 * Ultimate (R, krok 98 — pomysł właściciela): mocna umiejętność na pasku mocy.
 * Barbarzyńca — Szał, Czarodziejka — Supernowa z tarczą, łucznik — Totem-wabik.
 */
export type UltimateConfig =
  | {
      readonly kind: 'rage';
      readonly name: string;
      readonly durationMs: number;
      /** Mnożnik odnowienia ciosu i strzału (< 1 = szybciej). */
      readonly attackCooldownMultiplier: number;
      /** Mnożnik obrażeń ciosu i strzału. */
      readonly damageMultiplier: number;
      readonly moveSpeedMultiplier: number;
      /** Przez cały szał bohater nie przyjmuje trafień. */
      readonly invulnerable: boolean;
    }
  | {
      readonly kind: 'supernova';
      readonly name: string;
      /** Wybuch wokół Czarodziejki: magia, odrzut od środka. */
      readonly radius: number;
      readonly damage: number;
      readonly knockback: number;
      /** Tarcza po wybuchu: tyle ms bez przyjmowania trafień. */
      readonly shieldMs: number;
    }
  | {
      readonly kind: 'totem';
      readonly name: string;
      /** Totem stoi tyle ms; wrogowie i bossowie celują w niego zamiast w łucznika. */
      readonly durationMs: number;
      /** Totem sam strzela w najbliższego wroga w zasięgu. */
      readonly shotIntervalMs: number;
      readonly range: number;
      readonly damage: number;
      readonly knockback: number;
      readonly speed: number;
      readonly lifetimeMs: number;
    };

/** Pasek mocy ultimate: rośnie z czasem i za zabicia; pełny = R gotowe. */
export interface UltimateGaugeConfig {
  /** Przyrost na sekundę (1 = pełny pasek). */
  readonly passivePerSec: number;
  /** Przyrost za zabitego wroga. */
  readonly perKill: number;
  /** Stan paska na początku piętra (i areny). */
  readonly startCharge: number;
}

export interface HeroDefinition {
  readonly id: HeroId;
  readonly name: string;
  /** Opis na ekranie wyboru: krótkie hasło i linie o atakach. */
  readonly tagline: string;
  readonly attacks: readonly { readonly input: string; readonly text: string }[];
  readonly stats: PlayerStats;
  /** Dash, nietykalność; u barbarzyńcy także cios i strzał, u łucznika ładunki salwy (`ranged`). */
  readonly combat: PlayerCombatConfig;
  /** Broń: wręcz i strzał (barbarzyńca), magia (Czarodziejka) albo łuk (łucznik). */
  readonly kit: HeroKit;
  /** Ultimate pod R (krok 98). */
  readonly ultimate: UltimateConfig;
}
