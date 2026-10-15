import type { PlayerCombatConfig } from '@/core/combatTypes';
import type { PlayerStats } from '@/core/types';

/** Grywalni bohaterowie. Wybór żyje przez cały run (RunSnapshot). */
export enum HeroId {
  Barbarian = 'barbarian',
  Sorceress = 'sorceress',
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
  /** Odnowienie jednej pustej orbity (kule wracają po jednej). */
  readonly rechargeMs: number;
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

export interface HeroDefinition {
  readonly id: HeroId;
  readonly name: string;
  /** Opis na ekranie wyboru: krótkie hasło i linie o atakach. */
  readonly tagline: string;
  readonly attacks: readonly { readonly input: string; readonly text: string }[];
  readonly stats: PlayerStats;
  /** Dash, nietykalność; u barbarzyńcy także cios i strzał. */
  readonly combat: PlayerCombatConfig;
  /** Zestaw Czarodziejki; null = walka wręcz i strzał (barbarzyńca). */
  readonly sorcery: SorceryConfig | null;
}
