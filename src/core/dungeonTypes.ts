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
  /** Pokój końcowy za areną (krok 45) — osiągalny tylko przez nią; brak = arena to koniec piętra. */
  readonly endRoomId?: number;
}
