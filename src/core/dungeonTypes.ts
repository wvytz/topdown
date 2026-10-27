/** Typy domenowe piętra — czyste dane, bez zależności od Phasera. */

/**
 * Rodzaj kafla w danych piętra (stałych przez całe piętro). Otwarcie schodów i opuszczenie krat
 * to stan widoku i kolizji (DungeonView), nie zmiana danych piętra.
 */
export enum TileType {
  Wall = 0,
  Floor = 1,
  /** Blok schodów na kolejne piętro (STAIRS_SIZE × STAIRS_SIZE), otwierany po pokonaniu bossa. */
  StairsLocked = 2,
}

export enum RoomKind {
  Start = 'start',
  Normal = 'normal',
  Boss = 'boss',
  /** Ukryta komnata za areną (krok 46): bez wrogów i rekwizytów planerów, z kokonami skarbu. */
  Secret = 'secret',
  /** Pokój zasadzki (krok 49): pusty, z przynętą na środku; kraty, mrok i fale upiorów. */
  Ambush = 'ambush',
}

/** Pozycja w siatce kafelków (nie w pikselach). */
export interface TilePoint {
  readonly x: number;
  readonly y: number;
}

/** Prostokąt pokoju w kafelkach; (x, y) to lewy górny róg wnętrza. */
export interface Room {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly kind: RoomKind;
}

export interface IntRange {
  readonly min: number;
  readonly max: number;
}

export interface DungeonGeneratorConfig {
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly roomCount: IntRange;
  readonly roomSize: IntRange;
  /** Komnata bossa jest umieszczana jako pierwsza i większa — to arena walki. */
  readonly bossRoomSize: IntRange;
  /** Minimalny odstęp (w kafelkach) między pokojami. */
  readonly roomPadding: number;
  readonly corridorWidth: number;
  /** Dodatkowe korytarze ponad drzewo rozpinające, jako ułamek liczby pokojów — tworzą pętle. */
  readonly extraConnectionRatio: number;
  readonly maxPlacementAttempts: number;
  /** Arena na końcu piętra (krok 45): jedno wejście, najwyżej jeden ślepy pokój za nią. */
  readonly bossRoomAtEnd: boolean;
  /** Szansa na pokój końcowy za areną (gdy `bossRoomAtEnd`). */
  readonly endRoomChance: number;
  /** Prowadzenie korytarzy i pętli (krok 128). */
  readonly routing: CorridorRoutingConfig;
}

/**
 * Koszty drogi korytarza (krok 128): krok = 1, zakręt `turnCost`, krok po istniejącej podłodze `reuseCost`
 * (korytarze łączą się w skrzyżowania), krok, którego pędzel dotyka muru w odległości 1..`hugDistance` od cudzej
 * podłogi — dodatkowo `hugCost` (korytarz nie biegnie wzdłuż innego ani nie ociera się o pokoje).
 */
export interface CorridorRoutingConfig {
  readonly turnCost: number;
  readonly hugCost: number;
  readonly hugDistance: number;
  readonly reuseCost: number;
  readonly loops: {
    /** Najmniej pokojów w pętli (3 = pętla nie dubluje połączenia dwóch sąsiadów). */
    readonly minRooms: number;
    /** Najwięcej pokojów w pętli jako ułamek pokojów piętra — bez okrążenia całego piętra. */
    readonly maxRoomsRatio: number;
    /** Losowy rozrzut kolejności kandydatów (± połowa, mnożnik odległości). */
    readonly jitter: number;
    /** Koszt kroku po istniejącej podłodze dla pętli (drożej niż zwykle — pętla to nowy korytarz). */
    readonly reuseCost: number;
    /** Najmniejszy udział nowo wykutych kafli drogi pętli. */
    readonly minFreshRatio: number;
  };
}

export interface DungeonFloor {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  /** Płaska tablica kafelków, indeks = y * width + x. */
  readonly tiles: readonly TileType[];
  readonly rooms: readonly Room[];
  readonly startRoomId: number;
  readonly bossRoomId: number;
  readonly playerSpawn: TilePoint;
  readonly stairs: TilePoint;
  /** Pokój końcowy za areną (krok 45) — osiągalny tylko przez nią; ukryta komnata (krok 46). Brak = arena to koniec piętra. */
  readonly endRoomId?: number;
}
