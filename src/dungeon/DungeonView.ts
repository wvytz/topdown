import Phaser from 'phaser';
import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import { TextureKey } from '@/core/types';
import { TILE_SIZE } from '@/config/gameConfig';

/** Kolejność klatek w teksturze tilesetu — indeks w tablicy = indeks kafla w tilemapie. */
export const TILESET_FRAMES: readonly TileType[] = [
  TileType.Wall,
  TileType.Floor,
  TileType.StairsLocked,
  TileType.StairsOpen,
];

const tileIndexOf = (type: TileType): number => TILESET_FRAMES.indexOf(type);

/** Renderuje DungeonFloor jako tilemapę Phasera i wystawia warstwę kolizji ścian. */
export class DungeonView {
  readonly layer: Phaser.Tilemaps.TilemapLayer;
  readonly widthPx: number;
  readonly heightPx: number;

  constructor(scene: Phaser.Scene, floor: DungeonFloor) {
    const rows: number[][] = [];
    for (let y = 0; y < floor.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < floor.width; x++) {
        row.push(tileIndexOf(floor.tiles[y * floor.width + x] ?? TileType.Wall));
      }
      rows.push(row);
    }

    const map = scene.make.tilemap({ data: rows, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = map.addTilesetImage(TextureKey.Tileset, TextureKey.Tileset, TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error('DungeonView: nie udało się utworzyć tilesetu.');

    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('DungeonView: nie udało się utworzyć warstwy tilemapy.');

    layer.setCollision(tileIndexOf(TileType.Wall));
    this.layer = layer;
    this.widthPx = map.widthInPixels;
    this.heightPx = map.heightInPixels;
  }

  setTile(point: TilePoint, type: TileType): void {
    this.layer.putTileAt(tileIndexOf(type), point.x, point.y);
  }

  static tileToWorldCenter(point: TilePoint): { x: number; y: number } {
    return { x: (point.x + 0.5) * TILE_SIZE, y: (point.y + 0.5) * TILE_SIZE };
  }

  static worldToTile(x: number, y: number): TilePoint {
    return { x: Math.floor(x / TILE_SIZE), y: Math.floor(y / TILE_SIZE) };
  }
}
