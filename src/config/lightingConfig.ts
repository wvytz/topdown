/**
 * Oświetlenie (krok 19a): mrok otoczenia z winietą, światło gracza i pochodni, pyłki, cienie postaci.
 * Czysto wizualne. Od kroku 28a światło przechodzi płynnie (decyzja właściciela: bez „kręgów” pasm).
 */

/** Mrok wokół gracza: pełne światło w środku, płynne przejście ku krawędzi kadru. */
export interface AmbientProfile {
  /** Promień (px świata) pełnego światła wokół gracza. */
  readonly fullLightRadius: number;
  /** Odległość, od której mrok ma pełną siłę. */
  readonly edgeRadius: number;
  /** Najmocniejsze przyciemnienie (0–1). */
  readonly maxDarkness: number;
}

export interface TorchLightConfig {
  /** Promień światła pochodni (px świata). */
  readonly radius: number;
  /** Skoki promienia przy migotaniu (px), losowane w rytmie animacji płomienia. */
  readonly flickerOffsets: readonly number[];
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
   * W strefie, z której wróg może atakować (GUARANTEED_VIEW_HALF), mrok ma najwyżej 20% — tam obrys
   * wrogów zachowuje kontrast ≥ 2:1 (przy 30% spada do 1,89; test WCAG). Pełne 30% tylko przy samych
   * krawędziach kadru.
   */
  ambient: { fullLightRadius: 96, edgeRadius: 320, maxDarkness: 0.3 } satisfies AmbientProfile,
  /** Modyfikator „Mrok”: mechanika piętra, poza limitem 30%; pochodnie nie rozświetlają mroku. */
  darknessModifier: { maxDarkness: 0.94, softEdge: 0.45 },
  /**
   * Wrogowie w ograniczonym widoku („Mrok”, mgła; krok 30): od tej siły światła w pełni widoczni, niżej
   * płynnie znikają. Boss, pociski i czerwone strefy ataków zostają widoczne (decyzja właściciela).
   */
  enemyReveal: { revealStrength: 0.5 },
  torch: { radius: 72, flickerOffsets: [-3, 0, 0, 3], glowAlpha: 0.16 } satisfies TorchLightConfig,
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

/**
 * Mgła biomu (krok 28a, Grzybnia): zamiast mroku w kolorze otoczenia — jasna, fioletowo-niebieska mgła.
 * Wyraźnie tylko blisko bohatera, dalej płynnie gęstnieje; latarnie (pochodnie biomu) ją rozwiewają.
 * Dryfujące obłoczki: twarde elipsy w kolorze mgły ze stałą alfą.
 */
export interface FogConfig {
  readonly color: number;
  readonly profile: AmbientProfile;
  readonly wisps: {
    readonly maxParticles: number;
    readonly frequencyMs: number;
    readonly lifespanMs: { readonly min: number; readonly max: number };
    readonly speed: { readonly min: number; readonly max: number };
    readonly scale: { readonly min: number; readonly max: number };
    /** Rozmiar obłoczka w skali 1 (px świata). */
    readonly width: number;
    readonly height: number;
    readonly alpha: number;
  };
  /** Zarodniki w powietrzu (zamiast pyłków): więcej i wolniej. */
  readonly motes: DustMotesConfig;
}

export const FUNGAL_FOG: FogConfig = {
  // Głębokie indygo (nie czerń jak w „Mroku”): sylwetki i podłoga toną w fiolecie z błękitem.
  color: 0x272449,
  // Wyraźnie ok. 2 kafle, potem mgła płynnie gęstnieje do 88% na ok. 5 kaflach.
  profile: { fullLightRadius: 64, edgeRadius: 160, maxDarkness: 0.88 },
  wisps: {
    maxParticles: 14,
    frequencyMs: 500,
    lifespanMs: { min: 9000, max: 15000 },
    speed: { min: 3, max: 9 },
    scale: { min: 1, max: 2.4 },
    width: 40,
    height: 14,
    alpha: 0.14,
  },
  motes: { ...LIGHTING.motes, maxParticles: 60, frequencyMs: 90, speed: { min: 1, max: 4 }, gravityY: -0.6 },
};

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
