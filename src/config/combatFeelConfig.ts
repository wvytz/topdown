import { RenderQuality } from '@/core/displayTypes';
import { HitstopKind } from '@/core/combatFeelTypes';
import type { CombatFeelLevel } from '@/core/combatFeelTypes';

/**
 * Feel walki (krok U2, etap upgradu z `docs/UPGRADE.md`, STYLEGUIDE §13.5). Same efekty obrazu: liczby walki,
 * hitboxy, czas logiki i strumienie RNG się nie zmieniają. **Niska = gra sprzed upgradu** — wszystko tu wyłączone.
 */
export const COMBAT_FEEL_LEVELS: Readonly<Record<RenderQuality, CombatFeelLevel>> = {
  [RenderQuality.Low]: {
    hitSparks: false,
    slashTrail: false,
    shatter: false,
    blastOverDark: false,
    projectileHalo: false,
    heroHurtFlash: false,
    hitstop: false,
    shatterPieces: 0,
    sparkCount: 0,
  },
  [RenderQuality.Medium]: {
    hitSparks: true,
    slashTrail: true,
    shatter: true,
    blastOverDark: true,
    projectileHalo: true,
    heroHurtFlash: true,
    hitstop: true,
    shatterPieces: 6,
    sparkCount: 3,
  },
  [RenderQuality.High]: {
    hitSparks: true,
    slashTrail: true,
    shatter: true,
    blastOverDark: true,
    projectileHalo: true,
    heroHurtFlash: true,
    hitstop: true,
    shatterPieces: 10,
    sparkCount: 5,
  },
};

export const COMBAT_FEEL_CONFIG = {
  /**
   * Hitstop (§13.5): zatrzymuje wyłącznie obraz — logika liczy się dalej, więc nagranie wejść odtwarza się tak samo.
   * Tylko ciężki cios, zabicie elity i ostatni cios w bossa. „Mniej błysków” go wyłącza.
   */
  hitstop: {
    ms: { [HitstopKind.HeavyHit]: 45, [HitstopKind.EliteKill]: 70, [HitstopKind.BossKill]: 160 } satisfies Record<HitstopKind, number>,
    /** Najkrótsza przerwa między hitstopami — w nawale obraz nie może się rwać. Zabicie bossa ją pomija. */
    cooldownMs: 320,
    /** Ciężki cios: jedno trafienie za co najmniej tyle (Szał, Supernowa, przemiany, mocne strzały z przedmiotami). */
    heavyHitDamage: 40,
  },
  /** Drżenie przy hitstopie (piksele świata ≈ intensity × szerokość widoku; kolejne się nie sumują). */
  shake: {
    [HitstopKind.HeavyHit]: { ms: 70, intensity: 0.0025 },
    [HitstopKind.EliteKill]: { ms: 110, intensity: 0.004 },
    [HitstopKind.BossKill]: { ms: 260, intensity: 0.008 },
  } satisfies Record<HitstopKind, { readonly ms: number; readonly intensity: number }>,
  /** Iskry trafienia: kwadraty pikseli nad mrokiem, wylatują od źródła ciosu skokowo co `frameMs`. */
  sparks: {
    frameMs: 34,
    frames: 3,
    size: 2,
    /** Zasięg (px) kolejnych klatek. */
    reach: [3, 7, 10] as readonly number[],
    /** Rozrzut kąta wokół kierunku odrzutu (radiany). */
    spread: 1.1,
    /** Zwykły cios: ciepła biel; magia — fiolet Czarodziejki, tarcza — stal. */
    color: 0xfff1c8,
    blockedColor: 0x9fb4c8,
  },
  /** Smuga cięcia barbarzyńcy: łuk z pełnych pikseli w barwie klasy, gaśnie skokowo. */
  slash: {
    frameMs: 36,
    /** Alfa kolejnych klatek (pierwsza — jasne jądro). */
    alphas: [1, 0.7, 0.35] as readonly number[],
    /** Grubość łuku (px) kolejnych klatek. */
    widths: [4, 3, 2] as readonly number[],
    /** Jasne jądro pierwszej klatki (jedna klatka bieli, §13.5). */
    core: 0xfff6e0,
    /** Bursztyn barbarzyńcy (HERO_HUES 38°) — smuga mówi, czyj to cios. */
    color: 0xf0b048,
    /** Ile odcinków łuku (skokowy kształt zamiast gładkiej krzywej). */
    segments: 9,
  },
  /** Rozpad wroga: kawałki w barwie wroga z obrysem, lecą, spadają i znikają skokowo (pod mrokiem — to „ciało”). */
  shatter: {
    frameMs: 40,
    frames: 7,
    size: 3,
    /** Prędkość startowa kawałków (px na klatkę efektu). */
    speed: [2, 4] as readonly [number, number],
    /** Opadanie (px na klatkę², rzut z góry — „podskok” na posadzce). */
    gravity: 0.9,
    lift: 3,
    outline: 0x1b1a22,
    /** Elita sypie się dwa razy gęściej i w barwach cech. */
    eliteMultiplier: 2,
  },
  /** Błysk wybuchu nad mrokiem: pierścień i iskry (bez wypełnienia — nie zasłania postaci). */
  blast: {
    alpha: 0.85,
  },
  /** Światło pocisków wrogów (§13.5): mały krąg ADD nad mrokiem, w czerwieni zagrożenia. */
  projectileHalo: {
    radius: 6,
    color: 0xff5a3c,
    alpha: 0.4,
    /** Wewnętrzny, jaśniejszy krąg (dwa pełne stopnie zamiast gradientu). */
    coreRadius: 3,
    coreAlpha: 0.35,
  },
  /** Trafiony bohater: jedna klatka w barwie ostrzegawczej (zamiast bieli, §13.5). */
  heroHurt: {
    color: 0xff4a3a,
    ms: 70,
  },
} as const;
