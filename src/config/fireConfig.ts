import type { PlatformId } from '@/core/platform';

/**
 * Ogień walki (krok 144, `#ogien`): wspólny wygląd wybuchów, ataku bocianów Brudnej Wiedźmy i płonących plam.
 * Czysto wizualne — obrażenia i zasięgi liczą systemy gry. Limity zależą od wersji (telefon ma mniej obiektów).
 */
export const FIRE_FX = {
  /** Arkusze kul ognia (px komórki); gra bierze najmniejszy, który pokryje strefę, i całkowitą skalę. */
  burstSizes: [32, 64],
  /** Kula wypełnia tyle średnicy strefy (resztę dopowiada błysk i pierścień zasięgu). */
  burstCover: 1.1,
  /** Poświata (ADD, nad mrokiem): promień jako wielokrotność promienia strefy, alfa i czas gaśnięcia. */
  glow: { color: 0xff7a2a, radiusScale: 1.8, alpha: 0.5, durationMs: 480, minRadius: 24 },
  /** Światło ognia wycierane z mroku: szczyt jako wielokrotność promienia, czas, krok promienia (tekstury z pamięci). */
  light: { radiusScale: 2.6, minRadius: 32, maxRadius: 120, durationMs: 650, step: 8 },
  /** Płomienie zostające na podłodze: jeden na tyle px² strefy, w środkowej części koła, przez `lingerMs`. */
  flames: { areaPerFlame: 280, min: 1, max: 6, spread: 0.8, lingerMs: { min: 900, max: 1700 }, igniteDelayMs: 140 },
  /** Iskry (ADD) i dym wyrzucane przy wybuchu. */
  embers: { perRadius: 0.5, max: 18, lifespanMs: { min: 450, max: 900 }, speed: { min: 30, max: 110 }, gravityY: -60, colors: [0xffe08a, 0xffa040, 0xff5a2a] },
  smoke: { perRadius: 0.2, max: 7, lifespanMs: { min: 700, max: 1300 }, rise: { min: 10, max: 28 }, colors: [0x3a3236, 0x4a4044, 0x2a2428], alpha: 0.75 },
  /** Wstrząs: siła rośnie z promieniem, do sufitu (Phaser nie przerywa trwającego wstrząsu — seria daje dudnienie). */
  shake: { durationMs: 140, perRadius: 0.00012, max: 0.006, min: 0.0015 },
  /** Huk wybuchu najwyżej co tyle ms (atak bocianów ma kilkadziesiąt stref). */
  soundGapMs: 110,
  /** Płonąca plama (krok 114): płomienie stojące w plamie i poświata nad mrokiem. */
  patch: { flamesPerRadius: 1 / 9, maxFlames: 3, spread: 0.55, glowScale: 1.8, glowAlpha: 0.3, flicker: 0.15, lightScale: 1.6 },
  /** Telegraf: pierścień zaciska się z `startScale` promienia do brzegu strefy dokładnie w chwili uderzenia. */
  closing: { startScale: 1.6, color: 0xffd27a, alpha: 0.55, width: 1, fromProgress: 0.1 },
  /** Limity naraz (pula obiektów). */
  quality: {
    pc: { maxBursts: 64, maxFlames: 140, maxParticles: 320, maxLights: 12, particleScale: 1 },
    mobile: { maxBursts: 32, maxFlames: 48, maxParticles: 120, maxLights: 6, particleScale: 0.5 },
  } satisfies Record<PlatformId, FireQuality>,
} as const;

export interface FireQuality {
  readonly maxBursts: number;
  readonly maxFlames: number;
  readonly maxParticles: number;
  readonly maxLights: number;
  /** Mnożnik liczby iskier i dymu. */
  readonly particleScale: number;
}
