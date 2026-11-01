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
  /** Piekło (krok 157): szczelina z żarem w posadzce — oddycha; przejście obok wyrzuca snop iskier, potem stygnie. */
  LavaVent = 'lava-vent',
  /** Piekło: żużlowy chrząszcz z żarem pod pancerzem — ucieka spod nóg i staje dalej. */
  CinderBeetle = 'cinder-beetle',
  /** Mieszkanie gracza (krok 157): telewizor, monitor albo laptop — gra albo komunikat „do wieży”; przejście obok zakłóca obraz. */
  Screen = 'screen',
  /** Mieszkanie gracza: karaluchy — pierzchają spod nóg i chowają się w szparach pod murem. */
  Roach = 'roach',
  /** Mieszkanie gracza: pusta puszka — bohater kopie ją przy przejściu (w dashu mocniej), odbija się od murów. */
  Can = 'can',
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

/** Biegające drobiazgi (chrząszcze, karaluchy): ucieczka spod nóg w głąb pokoju albo do szpary pod murem. */
export interface ScuttlerConfig {
  /** Bohater bliżej niż tyle (px) płoszy; w dashu — z dalszej odległości. */
  readonly fleeRadius: number;
  readonly dashFleeRadius: number;
  /** Prędkość biegu (px/s) i jak długo trwa ucieczka (ms), zanim stworek przystanie. */
  readonly runSpeed: number;
  readonly runMs: number;
  /** Rozrzut kierunku ucieczki (± rad) — stado rozbiega się wachlarzem. */
  readonly spread: number;
  /** Czy chowa się, gdy dobiegnie do muru (karaluch znika w szparze; chrząszcz zawraca). */
  readonly hidesAtWall: boolean;
  /** Margines od brzegu pokoju (px). */
  readonly wallMarginPx: number;
}

export interface InfernalAmbientConfig {
  /** Szczeliny z żarem w pokoju (w głębi posadzki, nie pod murem). */
  readonly ventsPerRoom: IntRange;
  readonly minSpacingTiles: number;
  readonly vent: GlowPropConfig;
  /** Żużlowe chrząszcze: szansa na gromadkę w pokoju i jej wielkość (grzeją się przy szczelinach). */
  readonly beetles: {
    readonly roomChance: number;
    readonly count: IntRange;
    readonly lightRadius: number;
    readonly scuttle: ScuttlerConfig;
  };
  /** Iskry: ile tryska przy wydechu i co ile wzlatuje pojedyncza z widocznej szczeliny. */
  readonly sparks: {
    readonly burst: number;
    readonly driftIntervalMs: number;
    readonly lifespanMs: IntRange;
    readonly riseSpeed: IntRange;
    readonly maxParticles: number;
  };
}

export interface DenAmbientConfig {
  /** Ekrany (telewizor, monitor, laptop) pod murami: ile w pokoju i ile jeszcze działa (reszta — czarny ekran). */
  readonly screensPerRoom: IntRange;
  readonly litChance: number;
  readonly wallReachTiles: number;
  readonly minSpacingTiles: number;
  readonly screen: GlowPropConfig;
  /** Karaluchy: szansa na gromadkę w pokoju i jej wielkość. */
  readonly roaches: {
    readonly roomChance: number;
    readonly count: IntRange;
    readonly scuttle: ScuttlerConfig;
  };
  /** Puszki: ile w pokoju i jak się toczą po kopnięciu. */
  readonly cans: {
    readonly perRoom: IntRange;
    /** Bohater bliżej niż tyle (px) kopie puszkę — tylko przy wejściu w promień, nie stojąc obok. */
    readonly kickRadius: number;
    /** Prędkość po kopnięciu (px/s): zwykły chód i dash. */
    readonly walkKick: number;
    readonly dashKick: number;
    /** Hamowanie (1/s, wykładnicze) i sprężystość odbicia od muru (0..1). */
    readonly friction: number;
    readonly bounce: number;
    /** Poniżej tej prędkości (px/s) puszka staje; odbicie słychać od `clinkSpeed`. */
    readonly stopSpeed: number;
    readonly clinkSpeed: number;
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
  /** Piekło (krok 157); brak = bez szczelin i chrząszczy. */
  readonly infernal?: InfernalAmbientConfig | null;
  /** Mieszkanie gracza (krok 157); brak = bez ekranów, karaluchów i puszek. */
  readonly den?: DenAmbientConfig | null;
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

/**
 * Piekło (krok 157): w biomie bez cywilizacji żyje tylko żar. Szczeliny w głębi pokojów oddychają i wyrzucają iskry
 * pod nogi przechodzącego (bez obrażeń — to klimat, nie pułapka; pułapkami Piekła są paleniska), chrząszcze grzeją
 * się przy nich i uciekają. Liczby moje, do oceny właściciela.
 */
export const INFERNAL_AMBIENT: InfernalAmbientConfig = {
  ventsPerRoom: { min: 1, max: 3 },
  minSpacingTiles: 3,
  vent: {
    lightRadius: 28,
    pulseOffsets: [-2, 0, 2, 4, 2, 0],
    dimRadius: 12,
    startleRadius: 24,
    flinchMs: 330,
    dimMs: 2200,
    recoverMs: 1200,
  },
  beetles: {
    roomChance: 0.45,
    count: { min: 1, max: 3 },
    lightRadius: 10,
    scuttle: { fleeRadius: 40, dashFleeRadius: 70, runSpeed: 70, runMs: 700, spread: 0.7, hidesAtWall: false, wallMarginPx: 20 },
  },
  sparks: { burst: 12, driftIntervalMs: 380, lifespanMs: { min: 900, max: 1800 }, riseSpeed: { min: 12, max: 30 }, maxParticles: 80 },
};

/**
 * Mieszkanie gracza (krok 157): wyżej w wieży jest jeszcze prąd. Ekrany pod murami świecą zimnym błękitem (gra
 * albo komunikat z wieżą i strzałką w górę); przejście obok zakłóca obraz, a ekran na chwilę gaśnie do czuwania.
 * Karaluchy pierzchają do szpar, puszki turlają się po kopnięciu. Liczby moje, do oceny właściciela.
 */
export const DEN_AMBIENT: DenAmbientConfig = {
  screensPerRoom: { min: 1, max: 2 },
  litChance: 0.8,
  wallReachTiles: 1,
  minSpacingTiles: 3,
  screen: {
    lightRadius: 30,
    pulseOffsets: [0, -2, 0, 2, 0, -1],
    dimRadius: 8,
    startleRadius: 22,
    flinchMs: 450,
    dimMs: 1500,
    recoverMs: 500,
  },
  roaches: {
    roomChance: 0.55,
    count: { min: 2, max: 5 },
    scuttle: { fleeRadius: 44, dashFleeRadius: 76, runSpeed: 95, runMs: 1100, spread: 1.1, hidesAtWall: true, wallMarginPx: 12 },
  },
  cans: {
    perRoom: { min: 0, max: 2 },
    kickRadius: 9,
    walkKick: 70,
    dashKick: 190,
    friction: 2.2,
    bounce: 0.55,
    stopSpeed: 6,
    clinkSpeed: 40,
  },
};

export const AMBIENT_CONFIG: AmbientConfig = {
  revealsEnemies: true,
  activeMarginPx: 64,
};
