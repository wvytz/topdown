/**
 * Dekorowanie piętra (FloorDressing): gęstości detali i nazwy kafli z arkusza.
 * Czysto wizualne — nie wpływa na kolizje, linię wzroku ani zasady gry.
 */

export type CombatDecalKind = 'splat' | 'scorch' | 'slime';

export interface FloorDressingConfig {
  /** Szansa na wzór podłogi 2×2 w każdym wolnym bloku 2×2 (przełamuje siatkę 32 px). */
  readonly macroChance: number;
  /** Szansa na odbicie w poziomie kafla, który na to pozwala. */
  readonly flipChance: number;
  /** Szansa na zwykłą nakładkę (pęknięcie, plama…) na kaflu podłogi. */
  readonly decalChance: number;
  /** Wagi grup nakładek 1×1 przy losowaniu zwykłej nakładki. */
  readonly decalGroupWeights: Readonly<Record<string, number>>;
  /** Szansa na długie pęknięcie (2×1 lub 1×2) zaczynające się na kaflu. */
  readonly longCrackChance: number;
  readonly longCrackGroup: string;
  /**
   * Duże nakładki biomu (np. płyty nagrobne 1×2, zwłoki 2×1; krok 32a): szansa na kaflu i grupa.
   * Brak = biom ich nie ma (i nie zużywa losowań — dekorowanie innych biomów się nie zmienia).
   */
  readonly largeDecals?: readonly { readonly chance: number; readonly group: string }[];
  /** Kurz nawiany pod ścianę po danej stronie kafla. */
  readonly dust: {
    readonly north: { readonly chance: number; readonly group: string };
    readonly west: { readonly chance: number; readonly group: string };
    readonly east: { readonly chance: number; readonly group: string };
  };
  /** Promień (Czebyszewa, w kaflach) wokół spawnu, schodów i krat bez nakładek. */
  readonly clearRadius: number;
  readonly floorGroup: string;
  readonly floorMacroGroup: string;
  /** Baza podłogi korytarzy (poza prostokątami pokojów). */
  readonly corridorGroup: string;
  /** Detal na licu muru (prosty odcinek górnej ściany): szansa i grupa. */
  readonly wallFace: { readonly chance: number; readonly group: string };
  /** Łuk nad przejściem szerokości 2 w górnej i dolnej ścianie pokoju (nie nad kratami areny). */
  readonly archGroup: string;
  /** Pajęczyny w górnych narożnikach pokojów. */
  readonly cobweb: { readonly chance: number; readonly nwGroup: string; readonly neGroup: string };
  /** Trwałe ślady walki: pojemność puli (FIFO) i grupy kafli. */
  readonly combatDecals: { readonly capacity: number; readonly groups: Readonly<Record<CombatDecalKind, string>> };
  readonly stairsTiles: { readonly locked: string; readonly open: string };
  readonly gateTiles: Readonly<Record<'h' | 'v', Readonly<Record<'open' | 'half' | 'closed', string>>>>;
}

export const FLOOR_DRESSING: FloorDressingConfig = {
  macroChance: 0.04,
  flipChance: 0.5,
  decalChance: 0.1,
  decalGroupWeights: {
    'decal.crack': 4,
    'decal.debris': 2,
    'decal.stain': 1.5,
    // Wyłomy i gruz −60% (krok 19b): ciemne dziury dominowały pokój.
    'decal.broken': 0.4,
    'decal.rubble': 0.2,
  },
  longCrackChance: 0.012,
  longCrackGroup: 'decal.crackLong',
  dust: {
    north: { chance: 0.35, group: 'decal.dustN' },
    west: { chance: 0.25, group: 'decal.dustW' },
    east: { chance: 0.25, group: 'decal.dustE' },
  },
  clearRadius: 1,
  floorGroup: 'floor',
  floorMacroGroup: 'floorMacro',
  corridorGroup: 'floorCobble',
  wallFace: { chance: 0.1, group: 'wallFace' },
  archGroup: 'overhead.arch',
  cobweb: { chance: 0.35, nwGroup: 'overhead.cobwebNW', neGroup: 'overhead.cobwebNE' },
  combatDecals: { capacity: 180, groups: { splat: 'combat.splat', scorch: 'combat.scorch', slime: 'combat.slime' } },
  stairsTiles: { locked: 'stairs_sealed_2x2', open: 'stairs_open_2x2' },
  gateTiles: {
    h: { open: 'gate_h_open', half: 'gate_h_half', closed: 'gate_h_closed' },
    v: { open: 'gate_v_open', half: 'gate_v_half', closed: 'gate_v_closed' },
  },
};

/**
 * Pajęcze leże (krok 23a): więcej pajęczyn w narożnikach (nad postaciami), jaja i zwisające nici na licu,
 * wyblakłe pancerzyki na podłodze. Celowo bez pajęczyn i kokonów na podłodze — te będą elementami
 * rozgrywki (kroki 23d–e) i gracz nie może ich mylić z dekoracją.
 */
export const SPIDER_LAIR_DRESSING: FloorDressingConfig = {
  ...FLOOR_DRESSING,
  decalGroupWeights: { ...FLOOR_DRESSING.decalGroupWeights, 'decal.husk': 2.5 },
  wallFace: { chance: 0.18, group: 'wallFace.lair' },
  cobweb: { ...FLOOR_DRESSING.cobweb, chance: 0.7 },
};

/**
 * Grzybnia (krok 28a): dalszy ciąg leża porośnięty grzybem — kępki grzybów i grzybnia na podłodze,
 * mniej pancerzyków; grzyby półkowe i strzępki na licu; pajęczyny rzadsze niż w leżu.
 * Krok 28 (uwaga właściciela: „brakuje klimatu”): dwa razy więcej nakładek, w tym duże plamy pleśni,
 * a pleśń wpełzająca z murów (kafle `decal.dust*` w tym biomie) przy większości ścian.
 */
export const FUNGAL_GROVE_DRESSING: FloorDressingConfig = {
  ...FLOOR_DRESSING,
  decalChance: 0.2,
  decalGroupWeights: {
    ...FLOOR_DRESSING.decalGroupWeights,
    'decal.mold': 5,
    'decal.mushrooms': 3,
    'decal.mycel': 2,
    'decal.husk': 1,
  },
  dust: {
    north: { chance: 0.8, group: 'decal.dustN' },
    west: { chance: 0.7, group: 'decal.dustW' },
    east: { chance: 0.7, group: 'decal.dustE' },
  },
  wallFace: { chance: 0.22, group: 'wallFace.fungus' },
  cobweb: { ...FLOOR_DRESSING.cobweb, chance: 0.5 },
};

/**
 * Cmentarzysko (krok 32a): ludzki biom — kości, świeczki wotywne i nikła grzybnia na posadzce, płyty nagrobne
 * i zwłoki zatrutych jako duże nakładki; nisze z czaszkami, kostnica i epitafia na licu. Grzyba dużo mniej
 * niż w Grzybni („ledwo tu dociera”), pajęczyny rzadsze.
 */
export const GRAVEYARD_DRESSING: FloorDressingConfig = {
  ...FLOOR_DRESSING,
  decalChance: 0.14,
  decalGroupWeights: {
    'decal.crack': 3,
    'decal.debris': 1.5,
    'decal.stain': 1,
    'decal.broken': 0.4,
    'decal.rubble': 0.2,
    'decal.bones': 2.5,
    'decal.candles': 1.5,
    'decal.mycelFaint': 1,
  },
  largeDecals: [
    { chance: 0.012, group: 'decal.graveSlab' },
    { chance: 0.01, group: 'decal.corpse' },
  ],
  wallFace: { chance: 0.3, group: 'wallFace.grave' },
  cobweb: { ...FLOOR_DRESSING.cobweb, chance: 0.3 },
};
