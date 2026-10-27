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

/**
 * Mgiełka Cmentarzyska (krok 32a): grzyb ledwo tu dociera, więc to nie fioletowa mgła Grzybni, tylko zimny,
 * prawie czarny opar w trupiej zieleni. Widok przy bohaterze trochę szerszy niż w Grzybni, ale dalej mrok
 * gęstszy (każdy biom mroczniejszy od poprzedniego). Rzadkie, płaskie smugi przy ziemi i kurz grobowy.
 */
export const GRAVEYARD_MIST: FogConfig = {
  color: 0x121812,
  profile: { fullLightRadius: 72, edgeRadius: 190, maxDarkness: 0.92 },
  wisps: {
    maxParticles: 8,
    frequencyMs: 900,
    lifespanMs: { min: 10000, max: 16000 },
    speed: { min: 2, max: 6 },
    scale: { min: 1.2, max: 2.8 },
    width: 48,
    height: 10,
    alpha: 0.08,
  },
  motes: { ...LIGHTING.motes, maxParticles: 24, frequencyMs: 220, speed: { min: 1, max: 3 }, gravityY: 0.4 },
};

/**
 * Żar piekła (krok 41a): czerwonawa, prawie czarna duchota zamiast mgły — biom mroczniejszy od Cmentarzyska
 * (mrok do 93%), ale z widokiem przy bohaterze jak na Cmentarzysku. Rzadkie smugi dymu i wznoszące się
 * iskry (kolory „popiołu” palety to pomarańcz i czerwień żaru).
 */
export const INFERNAL_HAZE: FogConfig = {
  color: 0x1c0a0a,
  profile: { fullLightRadius: 72, edgeRadius: 180, maxDarkness: 0.93 },
  wisps: {
    maxParticles: 6,
    frequencyMs: 1100,
    lifespanMs: { min: 8000, max: 13000 },
    speed: { min: 3, max: 8 },
    scale: { min: 1.2, max: 2.4 },
    width: 40,
    height: 10,
    alpha: 0.07,
  },
  // Iskry: szybciej i wyraźnie w górę (ujemna grawitacja), jak znad palenisk.
  motes: { ...LIGHTING.motes, maxParticles: 30, frequencyMs: 180, speed: { min: 3, max: 9 }, gravityY: -6 },
};

/**
 * Dym palarni (krok 83): jasnoszara, gęsta mgła ograniczająca widok (nie mrok) — w dymie widać dalej niż w żarze piekła,
 * ale kłęby przesuwają się po ekranie i zasłaniają wrogów. Dużo powolnych smug dymu, bez iskier.
 */
export const SMOKE_HAZE: FogConfig = {
  color: 0x2a2a28,
  profile: { fullLightRadius: 96, edgeRadius: 220, maxDarkness: 0.8 },
  wisps: {
    maxParticles: 14,
    frequencyMs: 700,
    lifespanMs: { min: 9000, max: 15000 },
    speed: { min: 3, max: 9 },
    scale: { min: 1.6, max: 3.2 },
    width: 48,
    height: 14,
    alpha: 0.1,
  },
  motes: { ...LIGHTING.motes },
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

/**
 * Lustrzana posadzka (krok 124, `#lustrzana-komnata`): sprzątaczki polerują ją, aż świeci i odbija postacie.
 * Odbicie = kopia sprite'a odwrócona w pionie pod stopami (pod murami, więc rysuje się tylko na podłodze),
 * przezroczysta, gasnąca ku dołowi i lekko zabarwiona na błękit. Błyski świecą nad mrokiem jak płomienie pochodni.
 * Czysto wizualne; moje liczby, do oceny właściciela.
 */
export interface MirrorFloorConfig {
  readonly reflection: {
    /** Krycie odbicia przy stopach i na jego drugim końcu. */
    readonly alphaNear: number;
    readonly alphaFar: number;
    readonly tint: number;
  };
  readonly glints: {
    /** Odstęp między błyskami (ms) i najwięcej naraz. */
    readonly intervalMs: { readonly min: number; readonly max: number };
    readonly maxAlive: number;
    readonly alpha: number;
  };
}

export const MIRROR_FLOOR: MirrorFloorConfig = {
  reflection: { alphaNear: 0.45, alphaFar: 0.08, tint: 0xc8dcff },
  glints: { intervalMs: { min: 90, max: 260 }, maxAlive: 14, alpha: 0.85 },
};
