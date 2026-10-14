import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TilesetMeta } from '@/core/tilesetTypes';

export const TILESETS_DIR = fileURLToPath(new URL('../../public/assets/tilesets/', import.meta.url));

/** Arkusz kafli z generatora (to samo, co ładuje gra); domyślnie ruiny wieży. */
export function loadTileset(file = 'tower_ruins_tileset.json'): TilesetMeta {
  return JSON.parse(readFileSync(`${TILESETS_DIR}${file}`, 'utf8')) as TilesetMeta;
}
