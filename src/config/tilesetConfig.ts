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

/** Piekło (krok 41a): `python tools/tower_ruins_tiles.py --biome infernal`. Pochodnie z czerwieńszym ogniem. */
export const INFERNAL_TILESET_ASSET: TilesetAsset = {
  imageKey: 'tex-tileset-infernal',
  jsonKey: 'json-tileset-infernal',
  sheetKey: 'sheet-tileset-infernal',
  imageUrl: 'assets/tilesets/infernal_tileset.png',
  jsonUrl: 'assets/tilesets/infernal_tileset.json',
  torchAnimation: 'torch-flame-infernal',
  version: 2,
};

/** Zadymiona palarnia (krok 83): `python tools/tower_ruins_tiles.py --biome smoke_den`. Pochodnie jak w ruinach. */
export const SMOKE_DEN_TILESET_ASSET: TilesetAsset = {
  imageKey: 'tex-tileset-smoke-den',
  jsonKey: 'json-tileset-smoke-den',
  sheetKey: 'sheet-tileset-smoke-den',
  imageUrl: 'assets/tilesets/smoke_den_tileset.png',
  jsonUrl: 'assets/tilesets/smoke_den_tileset.json',
  torchAnimation: 'torch-flame-smoke-den',
  version: 2,
};

/**
 * Lustrzana komnata (krok 124): `python tools/tower_ruins_tiles.py --biome mirror_hall`. Polerowana, opalizująca
 * posadzka i najbardziej zniszczone mury w wieży; pochodnie jak w ruinach.
 */
export const MIRROR_HALL_TILESET_ASSET: TilesetAsset = {
  imageKey: 'tex-tileset-mirror-hall',
  jsonKey: 'json-tileset-mirror-hall',
  sheetKey: 'sheet-tileset-mirror-hall',
  imageUrl: 'assets/tilesets/mirror_hall_tileset.png',
  jsonUrl: 'assets/tilesets/mirror_hall_tileset.json',
  torchAnimation: 'torch-flame-mirror-hall',
  version: 2,
};

/**
 * Bociani Ogród (krok 137): `python tools/tower_ruins_tiles.py --biome stork_garden`. Zarośnięty taras na szczycie
 * kręgu nocą: omszałe płyty, trawa w szczelinach, bluszcz i gniazda na murach, pióra i błoto na posadzce.
 */
export const STORK_GARDEN_TILESET_ASSET: TilesetAsset = {
  imageKey: 'tex-tileset-stork-garden',
  jsonKey: 'json-tileset-stork-garden',
  sheetKey: 'sheet-tileset-stork-garden',
  imageUrl: 'assets/tilesets/stork_garden_tileset.png',
  jsonUrl: 'assets/tilesets/stork_garden_tileset.json',
  torchAnimation: 'torch-flame-stork-garden',
  version: 2,
};

/** Cmentarzysko (krok 32a): `python tools/tower_ruins_tiles.py --biome graveyard`. Pochodnie to świece w uchwytach. */
export const GRAVEYARD_TILESET_ASSET: TilesetAsset = {
  imageKey: 'tex-tileset-graveyard',
  jsonKey: 'json-tileset-graveyard',
  sheetKey: 'sheet-tileset-graveyard',
  imageUrl: 'assets/tilesets/graveyard_tileset.png',
  jsonUrl: 'assets/tilesets/graveyard_tileset.json',
  torchAnimation: 'torch-flame-graveyard',
  version: 2,
};

/** Grzybnia (krok 28a): `python tools/tower_ruins_tiles.py --biome fungal_grove`. Pochodnie to grzyby-latarnie. */
export const FUNGAL_GROVE_TILESET_ASSET: TilesetAsset = {
  imageKey: 'tex-tileset-fungal-grove',
  jsonKey: 'json-tileset-fungal-grove',
  sheetKey: 'sheet-tileset-fungal-grove',
  imageUrl: 'assets/tilesets/fungal_grove_tileset.png',
  jsonUrl: 'assets/tilesets/fungal_grove_tileset.json',
  torchAnimation: 'torch-flame-fungal-grove',
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
