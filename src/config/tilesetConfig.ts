/** Arkusz kafli z generatora (tools/tower_ruins_tiles.py) — pliki w public/assets/tilesets. */
export interface TilesetAsset {
  readonly imageKey: string;
  readonly jsonKey: string;
  /** Ten sam PNG jako arkusz klatek 32×32 (płomienie, uchwyty pochodni, ślady walki jako sprite'y). */
  readonly sheetKey: string;
  readonly imageUrl: string;
  readonly jsonUrl: string;
  /** Animacja płomienia pochodni z klatek tego arkusza. */
  readonly torchAnimation: string;
  /** Wersja formatu JSON, którą rozumie FloorDressing. */
  readonly version: 2;
}

/** Ruiny wieży (krok 16): domyślny biom. */
export const TILESET_ASSET: TilesetAsset = {
  imageKey: 'tex-tileset',
  jsonKey: 'json-tileset',
  sheetKey: 'sheet-tileset',
  imageUrl: 'assets/tilesets/tower_ruins_tileset.png',
  jsonUrl: 'assets/tilesets/tower_ruins_tileset.json',
  torchAnimation: 'torch-flame',
  version: 2,
};

/** Pajęcze leże (krok 23a): `python tools/tower_ruins_tiles.py --biome spider_lair`. */
export const SPIDER_LAIR_TILESET_ASSET: TilesetAsset = {
  imageKey: 'tex-tileset-spider-lair',
  jsonKey: 'json-tileset-spider-lair',
  sheetKey: 'sheet-tileset-spider-lair',
  imageUrl: 'assets/tilesets/spider_lair_tileset.png',
  jsonUrl: 'assets/tilesets/spider_lair_tileset.json',
  torchAnimation: 'torch-flame-spider-lair',
  version: 2,
};
