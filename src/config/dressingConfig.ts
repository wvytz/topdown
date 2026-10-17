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
  /**
   * Gniazdo bossa pająków (krok 52): im bliżej areny, tym gęstsze pajęczyny — gracz ma wyczuć, że zbliża się do gniazda.
   * Szansa rośnie liniowo od zwykłej (daleko) do `*Chance` (przy arenie); null = bez gniazda.
   */
  readonly nest: NestDressing | null;
  /** Trwałe ślady walki: pojemność puli (FIFO) i grupy kafli. */
  readonly combatDecals: { readonly capacity: number; readonly groups: Readonly<Record<CombatDecalKind, string>> };
  readonly stairsTiles: { readonly locked: string; readonly open: string };
  readonly gateTiles: Readonly<Record<'h' | 'v', Readonly<Record<'open' | 'half' | 'closed', string>>>>;
}

export interface NestDressing {
  /** Zasięg gniazda: odległość (kafle, w linii prostej) od areny, na której pajęczyn jest jeszcze więcej niż zwykle. */
  readonly radiusTiles: number;
  /** Szansa pajęczyny w górnym narożniku pokoju przy arenie (0 = biom bez pajęczyn). */
  readonly cobwebChance: number;
  /** Szansa pajęczyny przy murze korytarza przy arenie (krok 53); też rośnie ku arenie. */
  readonly corridorCobwebChance: number;
  /** Szansa nici/jaj (`wallFaceGroup`) na licu muru przy arenie. */
  readonly wallFaceChance: number;
  readonly wallFaceGroup: string;
  /** Dodatkowe nakładki na podłodze ku arenie (krok 54): grupa i szansa przy arenie, malejąca z odległością; null = brak. */
  readonly decals: { readonly group: string; readonly chance: number } | null;
  /** Ślady wleczenia i krwi od startu do wejścia areny (krok 54). */
  readonly trail: TrailDressing | null;
}

/** Ślad prowadzący do areny: ostatnie `lengthTiles` kafli drogi od startu do wejścia, gęstsze przy arenie. */
export interface TrailDressing {
  readonly lengthTiles: number;
  /** Szansa śladu na kaflu tuż przy wejściu i na końcu śladu (liniowo pomiędzy). */
  readonly chanceNear: number;
  readonly chanceFar: number;
  /** Udział ciągów kropli wśród śladów (reszta to smugi wleczenia). */
  readonly dropChance: number;
}

const TRAIL: TrailDressing = { lengthTiles: 18, chanceNear: 0.85, chanceFar: 0.2, dropChance: 0.3 };

/** Gniazdo pająków (krok 52–53): Pajęcze leże i Grzybnia, czyli piętra z bossami-pająkami. */
const SPIDER_NEST: NestDressing = {
  radiusTiles: 22,
  cobwebChance: 1,
  corridorCobwebChance: 0.6,
  wallFaceChance: 0.55,
  wallFaceGroup: 'wallFace.lair',
  decals: null,
  trail: TRAIL,
};

export const FLOOR_DRESSING: FloorDressingConfig = {
  // Ruiny (krok 54): bez pajęczyn i lica — ku arenie Strażnika tylko ślady wleczenia i plamy na posadzce.
  nest: {
    radiusTiles: 16,
    cobwebChance: 0,
    corridorCobwebChance: 0,
    wallFaceChance: 0,
    wallFaceGroup: 'wallFace',
    decals: { group: 'decal.stain', chance: 0.2 },
    trail: TRAIL,
  },
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
  nest: SPIDER_NEST,
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
  nest: SPIDER_NEST,
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
  // Krok 53: ku arenie gęstnieją nisze z czaszkami, kostnica i epitafia na licach.
  nest: {
    radiusTiles: 18,
    cobwebChance: 0,
    corridorCobwebChance: 0,
    wallFaceChance: 0.5,
    wallFaceGroup: 'wallFace.grave',
    // Stosy kości ku arenie (pomysł właściciela, krok 54).
    decals: { group: 'decal.bones', chance: 0.22 },
    trail: TRAIL,
  },
};

/**
 * Piekło (krok 41a): rozżarzone szczeliny i krew na posadzce, rzadkie pieczęcie 2×2 (duże nakładki),
 * kości; na licach okowy, czaszki na kolcach i szczeliny z żarem. Bez pajęczyn — za gorąco.
 */
export const INFERNAL_DRESSING: FloorDressingConfig = {
  ...FLOOR_DRESSING,
  decalChance: 0.15,
  decalGroupWeights: {
    'decal.crack': 2.5,
    'decal.debris': 1,
    'decal.broken': 0.4,
    'decal.ember': 3,
    'decal.blood': 2,
    'decal.bones': 1.2,
  },
  largeDecals: [{ chance: 0.006, group: 'decal.sigil' }],
  wallFace: { chance: 0.3, group: 'wallFace.infernal' },
  cobweb: { ...FLOOR_DRESSING.cobweb, chance: 0 },
  // Krok 53: ku arenie gęstnieją okowy, czaszki na kolcach i żar na licach — bez pajęczyn.
  nest: {
    radiusTiles: 18,
    cobwebChance: 0,
    corridorCobwebChance: 0,
    wallFaceChance: 0.5,
    wallFaceGroup: 'wallFace.infernal',
    // Żarzące się szczeliny na posadzce ku arenie (pomysł właściciela, krok 54).
    decals: { group: 'decal.ember', chance: 0.2 },
    trail: TRAIL,
  },
};

/**
 * Sala tronowa Grzybowego Pożeracza (krok 39, wygląd z paczki właściciela): tron z grzybni przy północnej ścianie
 * areny (3×3 kafle, bez kolizji) i naklejki krwi, grzybni i soku na podłodze. Moje liczby, do oceny w teście.
 * Kolejność wag = kolumny arkusza `throne-decals.png` (`ThroneDecalKind`).
 */
export const THRONE_ROOM = {
  /** Kokony spiżarni nie stoją bliżej tronu (Czebyszew, kafle). */
  throneClearTiles: 2,
  /** Wejście na północnej ścianie w tylu kaflach od osi tronu przesuwa tron w bok. */
  entranceClearTiles: 2,
  decals: {
    count: { min: 7, max: 10 },
    /** Kałuża krwi, rozbryzg, ślad wleczenia, grzybnia, kałuża soku, krata. */
    weights: [4, 4, 2, 3, 2, 1],
    minSpacingTiles: 2,
    /** Środek areny (schody po walce) bez naklejek. */
    centerClearTiles: 1,
  },
} as const;
