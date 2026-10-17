import type { RumbleConfig } from '@/systems/BossHerald';
import { BiomeId } from '@/config/biomeConfig';

/** Odcień światła w pobliżu areny: kolor (ADD, jak poświata pochodni) i alfa przy samej arenie. */
export interface HeraldTint {
  readonly color: number;
  readonly maxAlpha: number;
}

/** Iskry unoszące się z posadzki (Piekło); cząstki 1–2 px, jak pyłki. */
export interface HeraldSparks {
  readonly colors: readonly number[];
  /** Odstęp między cząstkami (ms) przy sile 1; im słabsza zapowiedź, tym rzadziej. */
  readonly frequencyMs: number;
  readonly lifespanMs: { readonly min: number; readonly max: number };
  readonly speedUp: { readonly min: number; readonly max: number };
  readonly maxParticles: number;
}

export interface BossHeraldConfig {
  /** Zasięg zapowiedzi (kafle od krawędzi areny). */
  readonly radiusTiles: number;
  readonly tint: HeraldTint | null;
  readonly sparks: HeraldSparks | null;
}

/**
 * Zapowiedź bossa (krok 54, pomysł właściciela): odcień światła, iskry i drżenie ekranu zbliżające się do areny.
 * Same efekty wizualne — bez wpływu na rozgrywkę; ślady na podłodze i pajęczyny są w `config/dressingConfig.ts`.
 */
export const BOSS_HERALD: Readonly<Record<BiomeId, BossHeraldConfig>> = {
  // Ciepłe, niespokojne światło — coś wielkiego czeka dalej.
  [BiomeId.TowerRuins]: { radiusTiles: 16, tint: { color: 0xff9a4a, maxAlpha: 0.05 }, sparks: null },
  // Chłodna zieleń gniazda.
  [BiomeId.SpiderLair]: { radiusTiles: 20, tint: { color: 0x7dff9a, maxAlpha: 0.04 }, sparks: null },
  // Błękitno-fioletowa poświata grzybni.
  [BiomeId.FungalGrove]: { radiusTiles: 20, tint: { color: 0x9a8aff, maxAlpha: 0.045 }, sparks: null },
  // Blady, trupi odcień.
  [BiomeId.Graveyard]: { radiusTiles: 16, tint: { color: 0xa8c0ff, maxAlpha: 0.04 }, sparks: null },
  // Rozżarzone powietrze i iskry z posadzki.
  [BiomeId.Infernal]: {
    radiusTiles: 18,
    tint: { color: 0xff3a14, maxAlpha: 0.07 },
    sparks: {
      colors: [0xff7a1f, 0xffb347, 0xe03a1e],
      frequencyMs: 70,
      lifespanMs: { min: 900, max: 1800 },
      speedUp: { min: 14, max: 34 },
      maxParticles: 40,
    },
  },
};

/** Drżenie ekranu przy zbliżaniu się do areny: ledwo wyczuwalne, narastające ku wejściu. */
export const HERALD_RUMBLE: RumbleConfig = {
  minStrength: 0.35,
  intervalMs: { far: 4200, near: 1700 },
  durationMs: 420,
  intensity: 0.0011,
};
