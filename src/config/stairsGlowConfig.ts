/**
 * Otwarta klatka schodowa (krok 186, przerobione w kroku 187): u wejścia słabe światło piętra, a wyżej czerń —
 * blade pyłki ciąg powietrza unosi w górę, w mrok spirali. Gra mówi „tędy w górę — w nieznane”. Czysto wizualne.
 */
export interface StairsGlowConfig {
  /** Promień światła przy wejściu (px świata). */
  readonly lightRadius: number;
  /** Środek światła względem lewego górnego rogu bloku (px): przy wejściu od południa. */
  readonly lightAt: { readonly x: number; readonly y: number };
  /** Prostokąt emisji pyłków względem lewego górnego rogu bloku (px): dolne stopnie. */
  readonly emitZone: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly frequencyMs: number;
  readonly maxParticles: number;
  readonly lifespanMs: { readonly min: number; readonly max: number };
  /** Prędkość wznoszenia (px/s, w górę ekranu). */
  readonly riseSpeed: { readonly min: number; readonly max: number };
  /** Dryf w bok (px/s): ciąg skręca razem ze spiralą. */
  readonly driftX: { readonly min: number; readonly max: number };
  readonly alpha: number;
}

export const STAIRS_GLOW: StairsGlowConfig = {
  lightRadius: 56,
  lightAt: { x: 48, y: 80 },
  emitZone: { x: 30, y: 54, width: 36, height: 30 },
  frequencyMs: 160,
  maxParticles: 16,
  lifespanMs: { min: 1600, max: 2600 },
  riseSpeed: { min: 10, max: 18 },
  driftX: { min: -10, max: 4 },
  alpha: 0.7,
};
