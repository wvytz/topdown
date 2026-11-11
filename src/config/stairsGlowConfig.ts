/**
 * Blask otwartych schodów (krok 186): światło z wyższego piętra i złote pyłki unoszące się w górę —
 * gra mówi „tędy w górę”, zanim gracz podejdzie. Czysto wizualne.
 */
export interface StairsGlowConfig {
  /** Promień światła w mroku (px świata); środek nad szczytem biegu. */
  readonly lightRadius: number;
  /** Przesunięcie środka światła od środka bloku schodów (px, ujemne = ku północy, ku łukowi). */
  readonly lightOffsetY: number;
  /** Prostokąt emisji pyłków względem lewego górnego rogu bloku (px). */
  readonly emitZone: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly frequencyMs: number;
  readonly maxParticles: number;
  readonly lifespanMs: { readonly min: number; readonly max: number };
  /** Prędkość wznoszenia (px/s, w górę ekranu). */
  readonly riseSpeed: { readonly min: number; readonly max: number };
  readonly alpha: number;
  /** Barwy pyłków: złoto łuku (GOLD z generatora kafli) — stałe we wszystkich biomach. */
  readonly moteColors: readonly number[];
}

export const STAIRS_GLOW: StairsGlowConfig = {
  lightRadius: 72,
  lightOffsetY: -12,
  emitZone: { x: 18, y: 24, width: 28, height: 34 },
  frequencyMs: 140,
  maxParticles: 18,
  lifespanMs: { min: 1100, max: 1900 },
  riseSpeed: { min: 14, max: 26 },
  alpha: 0.85,
  moteColors: [0xf0d27a, 0xd4a83a],
};
