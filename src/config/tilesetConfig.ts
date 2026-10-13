/** Arkusz kafli z generatora (tools/tower_ruins_tiles.py) — pliki w public/assets/tilesets. */
export const TILESET_ASSET = {
  /** Klucz tekstury = TextureKey.Tileset. */
  imageKey: 'tex-tileset',
  jsonKey: 'json-tileset',
  /** Ten sam PNG jako arkusz klatek 32×32 (płomienie, uchwyty pochodni jako sprite'y). */
  sheetKey: 'sheet-tileset',
  imageUrl: 'assets/tilesets/tower_ruins_tileset.png',
  jsonUrl: 'assets/tilesets/tower_ruins_tileset.json',
  /** Wersja formatu JSON, którą rozumie FloorDressing. */
  version: 2,
} as const;
