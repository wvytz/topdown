/**
 * Oświetlenie (krok 19a): mrok otoczenia z winietą, światło gracza i pochodni, pyłki, cienie postaci.
 * Czysto wizualne. Światło ma twarde pasma (bez ditheringu) — decyzja właściciela.
 */

/** Mrok wokół gracza: pełne światło w środku, pasma ku krawędzi kadru. */
export interface AmbientProfile {
  /** Promień (px świata) pełnego światła wokół gracza. */
  readonly fullLightRadius: number;
  /** Odległość, od której mrok ma pełną siłę. */
  readonly edgeRadius: number;
  /** Najmocniejsze przyciemnienie (0–1). */
  readonly maxDarkness: number;
  /** Liczba twardych pasm między pełnym światłem a pełnym mrokiem. */
  readonly bands: number;
}

export interface TorchLightConfig {
  /** Promień światła pochodni (px świata). */
  readonly radius: number;
  /** Skoki promienia przy migotaniu (px), losowane w rytmie animacji płomienia. */
  readonly flickerOffsets: readonly number[];
  readonly bands: number;
  /** Alfa ciepłej poświaty (mieszanie ADD) w środku światła. */
  readonly glowAlpha: number;
}

export interface DustMotesConfig {
  readonly maxParticles: number;
  readonly frequencyMs: number;
  readonly lifespanMs: { readonly min: number; readonly max: number };
  readonly speed: { readonly min: number; readonly max: number };
  /** Lekki wznos (px/s²; ujemny = do góry). */
  readonly gravityY: number;
  /** Jedna stała alfa pyłków. */
  readonly alpha: number;
}

export interface GroundShadowConfig {
  /** Stała alfa cienia (ta sama co cienie środowiska, STYLEGUIDE §6). */
  readonly alpha: number;
}

export const LIGHTING = {
  /**
   * Zwykłe piętro: najwyżej 30% przyciemnienia na krawędziach kadru (decyzja właściciela, krok 19a).
   * Pasma ułożone tak, że w strefie, z której wróg może atakować (GUARANTEED_VIEW_HALF), mrok ma
   * najwyżej 20% — tam obrys wrogów zachowuje kontrast ≥ 2:1 (przy 30% spada do 1,89; test WCAG).
   * Pełne 30% tylko przy samych krawędziach kadru.
   */
  ambient: { fullLightRadius: 96, edgeRadius: 320, maxDarkness: 0.3, bands: 3 } satisfies AmbientProfile,
  /** Modyfikator „Mrok”: mechanika piętra, poza limitem 30%; pochodnie nie rozświetlają mroku. */
  darknessModifier: { maxDarkness: 0.94, softEdge: 0.45, bands: 4 },
  torch: { radius: 72, flickerOffsets: [-3, 0, 0, 3], bands: 3, glowAlpha: 0.16 } satisfies TorchLightConfig,
  motes: {
    maxParticles: 36,
    frequencyMs: 160,
    lifespanMs: { min: 3000, max: 6000 },
    speed: { min: 2, max: 7 },
    gravityY: -1.5,
    alpha: 0.55,
  } satisfies DustMotesConfig,
  groundShadow: { alpha: 0.4 } satisfies GroundShadowConfig,
} as const;

export interface TorchPlacementConfig {
  /** Minimalny odstęp między pochodniami (Czebyszew, w kaflach). */
  readonly minSpacing: number;
  readonly maxPerRoom: number;
  readonly maxPerBossRoom: number;
}

export const TORCH_PLACEMENT: TorchPlacementConfig = {
  minSpacing: 4,
  maxPerRoom: 2,
  maxPerBossRoom: 4,
};
