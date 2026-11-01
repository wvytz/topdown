import type { PoisonEffect, SlipEffect, SlowEffect } from '@/core/combatTypes';
import type { TilePoint } from '@/core/dungeonTypes';

/**
 * Zmienne warunki na arenach bossów (krok 160, prośba właściciela: „interaktywne, zmienne warunki” zamiast
 * stałych murów). Każdy biom może mieć własny zestaw; liczby w `config/arenaConditionsConfig.ts`.
 */

/** Rytm zdarzenia: spokojnie i we wściekłości bossa (ms). */
export interface ConditionRhythm {
  readonly calmMs: number;
  readonly enragedMs: number;
}

/** A1 „Uwaga, ślisko!” — sprzątaczki myją arenę pasami; mokre = poślizg dla wszystkich. */
export interface WetFloorConfig {
  /** Co ile nowy pas mytej posadzki (pierwszy po `firstAfterMs` od początku walki). */
  readonly every: ConditionRhythm;
  readonly firstAfterMs: number;
  /** Wysokość pasa w kaflach (pas idzie przez całą szerokość areny). */
  readonly laneTiles: number;
  /** Mop przejeżdża pas od brzegu do brzegu (ms) — mokre jest tylko to, co już umyte. */
  readonly sweepMs: number;
  /** Ile pas jest mokry po umyciu, potem wysycha przez `dryMs` (już nie ślizga). */
  readonly wetMs: number;
  readonly dryMs: number;
  readonly maxLanes: number;
  /** Poślizg bohatera na mokrym (ten sam co w kałuży z wiadra). */
  readonly slip: SlipEffect;
  /** Szarżujący boss na mokrym wpada w poślizg; uderzenie w mur ogłusza. */
  readonly bossSlide: {
    /** Od jakiej prędkości (px/s) boss się ślizga — chód nie, szarża tak. */
    readonly minSpeed: number;
    readonly slideMs: number;
    /** Mnożnik prędkości w poślizgu (rozpęd). */
    readonly speedMultiplier: number;
    /** Ogłuszenie po uderzeniu w mur (przed odpornością bossa ×0,4). */
    readonly stunMs: number;
    /** Ten sam boss nie ślizga się częściej niż co tyle. */
    readonly cooldownMs: number;
  };
  /** Wiadra na arenie: trafione przewraca się i rozlewa kałużę w stronę ciosu. */
  readonly buckets: {
    readonly count: number;
    readonly radius: number;
    readonly puddleRadius: number;
    readonly puddleMs: number;
    /** Kałuża rozlewa się tyle px od wiadra w stronę ciosu. */
    readonly spillOffsetPx: number;
  };
}

/** A3 „Komnata się sypie” — grube mury po bokach areny walą się z fazami walki i odsłaniają zaplecze. */
export interface CollapseConfig {
  /** Grubość dodatkowego muru po każdej stronie (kafle). */
  readonly depthTiles: number;
  /** Wolne rzędy przy górnej i dolnej ścianie (arena nigdy się nie dzieli). */
  readonly cornerGapTiles: number;
  /** Bez muru tak blisko wejścia (kafle). */
  readonly entranceClearTiles: number;
  /** Odstęp między kolejnymi walącymi się kaflami (ms) — fala gruzu. */
  readonly rippleMs: number;
  /** Butle chloru w zapleczu (za murem, który wali się pierwszy). */
  readonly bottles: {
    readonly count: number;
    readonly radius: number;
    readonly cloud: {
      readonly radius: number;
      readonly durationMs: number;
      readonly tickMs: number;
      /** Obrażenia bossa co `tickMs` w chmurze (chlor rani też sprzątaczkę). */
      readonly bossDamage: number;
      readonly poison: PoisonEffect;
    };
  };
}

/** A2 — wolnostojące lustra: osłona, odbijają pociski, pękają; sprzątaczka przechodzi przez nie. */
export interface MirrorPaneConfig {
  readonly count: number;
  /** Ile trafień wytrzyma lustro (odbity pocisk też się liczy). */
  readonly hits: number;
  /** Lustra trzymają się z dala od środka (start bossa) i od siebie. */
  readonly minGapTiles: number;
  readonly shards: { readonly radius: number; readonly durationMs: number; readonly slow: SlowEffect };
  /** Sprzątaczka, która utknie przy lustrze, wychodzi z drugiego. */
  readonly teleport: { readonly touchPx: number; readonly cooldownMs: number };
}

/** B3 — taras na dachu wieży: jeden bok nad przepaścią, płyty pękają po uderzeniach z góry, podmuchy ku krawędzi. */
export interface TerraceConfig {
  /** Najwyżej tyle podłogi areny może zamienić się w dziury. */
  readonly maxHoleFraction: number;
  /** Płyta pęka (czerwona ramka) tyle ms, zanim odpadnie. */
  readonly crackMs: number;
  /** Lądowanie na bocianach łamie płyty w tym promieniu (kafle). */
  readonly leapCrackRadiusTiles: number;
  /** Od jakiego promienia strefa bez własnego wyglądu to lądowanie (łamie kilka płyt). */
  readonly leapMinRadiusPx: number;
  /** Bez dziur tak blisko wejścia i schodów (kafle). */
  readonly clearTiles: number;
  readonly fall: {
    /** Część maksymalnego HP odbierana przy upadku. */
    readonly damageFraction: number;
    /** Po upadku bohater chwilę nie spada ponownie. */
    readonly graceMs: number;
  };
  readonly wind: {
    readonly every: ConditionRhythm;
    readonly firstAfterMs: number;
    readonly telegraphMs: number;
    readonly gustMs: number;
    /** Siła podmuchu (px/s) — doliczana do ruchu bohatera. */
    readonly pushPx: number;
  };
}

/** B2 — żywopłot rośnie z ziemi i dzieli arenę na zaułki; da się go przeciąć. */
export interface HedgeConfig {
  readonly every: ConditionRhythm;
  readonly firstAfterMs: number;
  readonly lengthTiles: number;
  readonly telegraphMs: number;
  readonly lifeMs: number;
  readonly hitsPerTile: number;
  readonly maxAlive: number;
  /** Żywopłot nie wyrasta bliżej bohatera ani bossa (kafle). */
  readonly clearOfBodiesTiles: number;
}

/** B1 — słupy z bocianimi gniazdami: osłona przed kluczem bocianów; zburzone gniazdo = mniej bocianów. */
export interface NestPillarConfig {
  readonly count: number;
  readonly nestHits: number;
  /** Pasy klucza bez gniazd; każde stojące gniazdo dokłada jeden (wściekłość: +1 jak dotąd). */
  readonly baseLanes: number;
}

/** Zestaw warunków areny biomu. */
export interface ArenaConditionsConfig {
  readonly wetFloor?: WetFloorConfig;
  readonly collapse?: CollapseConfig;
  readonly mirrors?: MirrorPaneConfig;
  readonly terrace?: TerraceConfig;
  readonly hedges?: HedgeConfig;
  readonly nestPillars?: NestPillarConfig;
}

/** Strona areny. */
export enum ArenaSide {
  North = 'north',
  East = 'east',
  South = 'south',
  West = 'west',
}

/** Kafel muru, który wali się w fazie `phase` walki (1 — pierwsza zmiana fazy, 2 — druga). */
export interface RubbleTile extends TilePoint {
  readonly phase: number;
}

/** Rozmieszczenie stałych elementów areny (czysty planer, deterministyczny). */
export interface ArenaLayout {
  readonly rubble: readonly RubbleTile[];
  /** Butle chloru — stoją na kaflach muru, który wali się w fazie 1 (widać je dopiero potem). */
  readonly bottles: readonly TilePoint[];
  readonly buckets: readonly TilePoint[];
  readonly mirrors: readonly TilePoint[];
  readonly pillars: readonly TilePoint[];
  /** Bok tarasu nad przepaścią (bez wejścia); null — bez tarasu. */
  readonly abyss: ArenaSide | null;
}
