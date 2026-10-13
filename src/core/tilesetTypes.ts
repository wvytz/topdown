/**
 * Opis arkusza kafli (JSON v2 z generatora tools/tower_ruins_tiles.py) — czyste dane, bez Phasera.
 * Plik JSON ładuje warstwa silnika; logika dostaje gotowy obiekt.
 */

export interface TilesetTile {
  /** Indeks klatki w arkuszu (wiersz * kolumny + kolumna) lewego górnego kafla. */
  readonly frame: number;
  readonly col: number;
  readonly row: number;
  /** Rozmiar w kaflach (elementy wielokaflowe, np. schody 2×2). */
  readonly w: number;
  readonly h: number;
  readonly layer: string;
  /** Indeksy części elementu wielokaflowego, wiersz po wierszu (tylko gdy w lub h > 1). */
  readonly frames?: readonly (readonly number[])[];
  /** Waga losowania w grupie wariantów. */
  readonly weight?: number;
  /** Kafel wolno odbić w poziomie (światło pada z północy, więc tylko w poziomie). */
  readonly flipX?: boolean;
}

export interface TilesetMeta {
  readonly version: number;
  readonly biome: string;
  readonly palette: string;
  readonly image: string;
  readonly tileSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly envShadowAlpha: number;
  readonly tiles: Readonly<Record<string, TilesetTile>>;
  readonly groups: Readonly<Record<string, readonly string[]>>;
  readonly autotile: {
    readonly wall: {
      /** Bit ustawiony = sąsiad jest ścianą (brzeg mapy też). */
      readonly bits: Readonly<Record<string, number>>;
      /** Maska (0–15, jako tekst) → grupa wariantów. */
      readonly variants: Readonly<Record<string, string>>;
      /** Maska 15 z podłogą po skosie: bity NE/SE/SW/NW → kafel z domkniętym narożnikiem. */
      readonly diagonal: {
        readonly appliesToMask: number;
        readonly bits: Readonly<Record<string, number>>;
        readonly tiles: Readonly<Record<string, string>>;
      };
      /** Pasma odległości (Czebyszewa) od najbliższej podłogi. */
      readonly bands: {
        readonly edge: number;
        readonly fade: number;
        readonly deep: number;
        readonly groups: { readonly fade: string; readonly deep: string };
      };
    };
    readonly envShadow: {
      readonly bits: Readonly<Record<string, number>>;
      readonly tiles: Readonly<Record<string, string>>;
    };
  };
}
