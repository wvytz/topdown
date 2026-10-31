import type { IntRange } from '@/core/dungeonTypes';

/**
 * Żywe otoczenie biomów (krok 156, `#zywe-otoczenie`): animowane rekwizyty bez kolizji, które reagują na bohatera.
 * Grzybnia (piętro 2) — świecące kępy grzybów z żyłkami grzybni, stare lampy zarośnięte grzybem (resztki cywilizacji)
 * i świecące ćmy; Cmentarzysko (piętro 3) — znicze (ktoś jeszcze pamięta o zmarłych), błędne ogniki i kruki.
 * Wszystko czysto wizualne poza małymi światłami: rozwiewają mrok i mgłę jak pochodnie (`revealsEnemies` — także
 * odsłaniają wrogów). Liczby moje, do oceny właściciela.
 */

/** Rodzaj rekwizytu żywego otoczenia. */
export enum AmbientKind {
  /** Grzybnia: kępa świecących grzybów z żyłkami grzybni; bohater obok — grzyby się kulą, sypią zarodnikami i gasną. */
  Glowcap = 'glowcap',
  /** Grzybnia: stara lampa z pękniętym kloszem, w której rośnie świecący grzyb (resztka cywilizacji). */
  OvergrownLamp = 'overgrown-lamp',
  /** Cmentarzysko: znicze przy murach; przejście obok szarpie płomieniem, dash obok gasi znicz na dobre. */
  Candle = 'candle',
  /** Cmentarzysko: błędny ognik — snuje się po pokoju i ucieka przed bohaterem. */
  Wisp = 'wisp',
  /** Cmentarzysko: kruk na posadzce — dziobie, a gdy bohater podejdzie, odlatuje. */
  Raven = 'raven',
}

/** Rekwizyt świecący (kępa grzybów, lampa, znicz): światło, płoszenie i powrót. */
export interface GlowPropConfig {
  /** Promień światła w spokoju (px) i skoki migotania/pulsu w rytmie klatek. */
  readonly lightRadius: number;
  readonly pulseOffsets: readonly number[];
  /** Promień światła po spłoszeniu (grzyby przygasają; 0 = gaśnie całkiem). */
  readonly dimRadius: number;
  /** Bohater bliżej niż tyle (px) płoszy rekwizyt. */
  readonly startleRadius: number;
  /** Ile trwa skulenie (animacja „flinch”), przygaszenie i powrót do pulsu (ms). */
  readonly flinchMs: number;
  readonly dimMs: number;
  readonly recoverMs: number;
}

export interface GroveAmbientConfig {
  /** Kępy grzybów w pokoju (start i zwykłe, bez areny). */
  readonly glowcapsPerRoom: IntRange;
  /** Szansa na zarośniętą lampę w pokoju (najwyżej jedna). */
  readonly lampChance: number;
  /** Kępa przy murze: najwyżej tyle kafli od ściany. */
  readonly wallReachTiles: number;
  readonly minSpacingTiles: number;
  readonly glowcap: GlowPropConfig;
  readonly lamp: GlowPropConfig;
  /** Świecące ćmy: szansa, że kępa/lampa je ma, ile ich i jak krążą. */
  readonly moths: {
    readonly chance: number;
    readonly count: IntRange;
    readonly orbitRadius: number;
    /** Obieg w radianach na sekundę (każda ćma ma swój ułamek). */
    readonly orbitSpeed: number;
    /** Po spłoszeniu orbita rośnie tyle razy i wraca w `recoverMs`. */
    readonly scatterScale: number;
    readonly recoverMs: number;
  };
  /** Zarodniki: ile sypnie się przy spłoszeniu i co ile wzlatuje pojedynczy z widocznych kęp. */
  readonly spores: {
    readonly burst: number;
    readonly driftIntervalMs: number;
    readonly lifespanMs: IntRange;
    readonly riseSpeed: IntRange;
    readonly maxParticles: number;
  };
}

export interface GraveyardAmbientConfig {
  /** Grupy zniczy w pokoju (pod murami). */
  readonly candlesPerRoom: IntRange;
  /** Szansa, że znicz jeszcze się pali (reszta wypalona). */
  readonly litChance: number;
  readonly wallReachTiles: number;
  readonly minSpacingTiles: number;
  readonly candle: GlowPropConfig & {
    /** Dash bliżej niż tyle (px) gasi znicz na dobre (dym), zwykły chód tylko szarpie płomieniem. */
    readonly snuffRadius: number;
  };
  /** Kruki: szansa na stadko w pokoju i jego wielkość. */
  readonly ravens: {
    readonly roomChance: number;
    readonly count: IntRange;
    /** Bohater bliżej niż tyle (px) płoszy kruka; w dashu — z dalszej odległości. */
    readonly fleeRadius: number;
    readonly dashFleeRadius: number;
    /** Spłoszony kruk płoszy sąsiadów w tym promieniu (z opóźnieniem — stado zrywa się falą). */
    readonly flockRadius: number;
    readonly flockDelayMs: IntRange;
    /** Lot: prędkość startowa i końcowa (px/s), wznoszenie (px/s, rysowane jako uniesienie nad cieniem), czas do zniknięcia. */
    readonly takeoffSpeed: number;
    readonly cruiseSpeed: number;
    readonly climbSpeed: number;
    readonly flightMs: number;
  };
  /** Błędne ogniki: szansa na ognik w pokoju i ich zachowanie. */
  readonly wisps: {
    readonly roomChance: number;
    readonly lightRadius: number;
    readonly pulseOffsets: readonly number[];
    /** Kołysanie wokół „domu” (px, rad/s). */
    readonly swayRadius: IntRange;
    readonly swaySpeed: number;
    /** Ucieka, gdy bohater bliżej niż tyle (px), z tą prędkością (px/s); trzyma się z dala od murów. */
    readonly fleeRadius: number;
    readonly fleeSpeed: number;
    readonly wallMarginPx: number;
  };
}

export interface AmbientConfig {
  /** Czy światła żywego otoczenia odsłaniają wrogów we mgle i mroku (jak pochodnie). */
  readonly revealsEnemies: boolean;
  /** Rekwizyty i animacje liczymy tylko blisko kadru (px zapasu poza widokiem). */
  readonly activeMarginPx: number;
}

/** Żywe otoczenie biomu (`BiomeDefinition.ambient`): zestaw Grzybni, Cmentarzyska albo oba. */
export interface BiomeAmbientConfig {
  readonly grove: GroveAmbientConfig | null;
  readonly graveyard: GraveyardAmbientConfig | null;
}

/** Grzybnia: biom „pełniejszy” od leża — kępy przy każdym murze, co trzeci pokój stara lampa. */
export const GROVE_AMBIENT: GroveAmbientConfig = {
  glowcapsPerRoom: { min: 2, max: 4 },
  lampChance: 0.35,
  wallReachTiles: 1,
  minSpacingTiles: 3,
  glowcap: {
    lightRadius: 26,
    pulseOffsets: [-2, 0, 2, 4, 2, 0],
    dimRadius: 10,
    startleRadius: 22,
    flinchMs: 330,
    dimMs: 2400,
    recoverMs: 900,
  },
  lamp: {
    lightRadius: 34,
    pulseOffsets: [-2, 0, 2, 3, 2, 0],
    dimRadius: 16,
    startleRadius: 20,
    flinchMs: 330,
    dimMs: 1600,
    recoverMs: 900,
  },
  moths: { chance: 0.55, count: { min: 1, max: 3 }, orbitRadius: 11, orbitSpeed: 2.4, scatterScale: 3.2, recoverMs: 2200 },
  spores: { burst: 9, driftIntervalMs: 420, lifespanMs: { min: 1800, max: 3200 }, riseSpeed: { min: 4, max: 11 }, maxParticles: 70 },
};

/** Cmentarzysko: znicze pod murami, co drugi pokój ognik, co trzeci stadko kruków. */
export const GRAVEYARD_AMBIENT: GraveyardAmbientConfig = {
  candlesPerRoom: { min: 1, max: 3 },
  litChance: 0.8,
  wallReachTiles: 1,
  minSpacingTiles: 3,
  candle: {
    lightRadius: 22,
    pulseOffsets: [-2, 0, 1, -1],
    dimRadius: 0,
    startleRadius: 18,
    flinchMs: 330,
    dimMs: 0,
    recoverMs: 0,
    snuffRadius: 20,
  },
  ravens: {
    roomChance: 0.35,
    count: { min: 1, max: 3 },
    fleeRadius: 46,
    dashFleeRadius: 80,
    flockRadius: 64,
    flockDelayMs: { min: 90, max: 260 },
    takeoffSpeed: 50,
    cruiseSpeed: 150,
    climbSpeed: 34,
    flightMs: 1900,
  },
  wisps: {
    roomChance: 0.5,
    lightRadius: 24,
    pulseOffsets: [-2, 0, 2, 0],
    swayRadius: { min: 6, max: 14 },
    swaySpeed: 0.9,
    fleeRadius: 52,
    fleeSpeed: 38,
    wallMarginPx: 20,
  },
};

export const AMBIENT_CONFIG: AmbientConfig = {
  revealsEnemies: true,
  activeMarginPx: 64,
};
