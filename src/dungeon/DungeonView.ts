import Phaser from 'phaser';
import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { TilesetMeta } from '@/core/tilesetTypes';
import { TextureKey } from '@/core/types';
import { ARENA_GATES } from '@/config/bossConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { TILESET_ASSET } from '@/config/tilesetConfig';
import type { DressedFloor, DressedGate, DressedLayer, GateVisualState } from '@/dungeon/FloorDressing';
import { EMPTY_TILE } from '@/dungeon/FloorDressing';

type VisualLayer = 'floorBase' | 'floorDecal' | 'floorFeature' | 'envShadow' | 'walls' | 'overhead';
const VISUAL_LAYERS: readonly VisualLayer[] = ['floorBase', 'floorDecal', 'floorFeature', 'envShadow', 'walls', 'overhead'];

const pointKey = (p: TilePoint) => `${p.x},${p.y}`;

/**
 * Rysuje piętro warstwami z FloorDressing (każda TilemapLayer na swojej głębokości z RENDER_DEPTH)
 * i wystawia niewidoczną warstwę kolizji: ściany oraz opuszczone kraty.
 * Tylko wykonuje decyzje — co i gdzie leży, ustala czysty FloorDressing.
 */
export class DungeonView {
  readonly collisionLayer: Phaser.Tilemaps.TilemapLayer;
  readonly widthPx: number;
  readonly heightPx: number;
  private readonly featureLayer: Phaser.Tilemaps.TilemapLayer;
  private readonly gateLayer: Phaser.Tilemaps.TilemapLayer;
  private readonly gates: ReadonlyMap<string, DressedGate>;
  /** Jedna klatka dla wszystkich kafli kolizji — putTileAt nadaje jej kolizję także później (kraty). */
  private readonly collisionFrame: number;

  constructor(
    private readonly scene: Phaser.Scene,
    floor: DungeonFloor,
    private readonly dressed: DressedFloor,
    tileset: TilesetMeta,
  ) {
    if (tileset.version !== TILESET_ASSET.version || tileset.tileSize !== TILE_SIZE) {
      throw new Error(`DungeonView: arkusz v${tileset.version} ${tileset.tileSize}px, oczekiwano v${TILESET_ASSET.version} ${TILE_SIZE}px.`);
    }
    const map = scene.make.tilemap({ tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, width: floor.width, height: floor.height });
    const tiles = map.addTilesetImage(tileset.biome, TextureKey.Tileset, TILE_SIZE, TILE_SIZE, 0, 0, 0);
    if (!tiles) throw new Error('DungeonView: nie udało się utworzyć tilesetu.');
    const blank = (name: string, depth: number) => {
      const layer = map.createBlankLayer(name, tiles);
      if (!layer) throw new Error(`DungeonView: nie udało się utworzyć warstwy „${name}”.`);
      return layer.setDepth(depth);
    };

    const layers = new Map<VisualLayer, Phaser.Tilemaps.TilemapLayer>();
    for (const name of VISUAL_LAYERS) {
      const layer = blank(name, RENDER_DEPTH[name]);
      fillLayer(layer, dressed[name]);
      layers.set(name, layer);
    }
    this.featureLayer = layers.get('floorFeature')!;

    // Kraty: na start podniesione (widać tylko szczelinę w posadzce).
    this.gateLayer = blank('gates', RENDER_DEPTH.gates);
    for (const gate of dressed.gates) this.gateLayer.putTileAt(gate.frames.open, gate.x, gate.y, false);
    this.gates = new Map(dressed.gates.map((g) => [pointKey(g), g]));

    // Kolizja na osobnej, niewidocznej warstwie logicznej.
    this.collisionFrame = dressed.walls.frames.find((f) => f !== EMPTY_TILE) ?? 0;
    const collision = blank('collision', 0).setVisible(false);
    floor.tiles.forEach((type, i) => {
      if (type === TileType.Wall) collision.putTileAt(this.collisionFrame, i % floor.width, Math.floor(i / floor.width), false);
    });
    collision.setCollision([this.collisionFrame]);
    this.collisionLayer = collision;

    this.widthPx = map.widthInPixels;
    this.heightPx = map.heightInPixels;
  }

  /** Schody po pokonaniu bossa: podmiana klatek bloku na otwarte. */
  openStairs(): void {
    const { anchor, open } = this.dressed.stairs;
    open.forEach((row, dy) => row.forEach((frame, dx) => this.featureLayer.putTileAt(frame, anchor.x + dx, anchor.y + dy, false)));
  }

  /** Krata opada: kolizja od razu, obraz w klatkach opadania. */
  sealGate(point: TilePoint): void {
    const gate = this.gateAt(point);
    this.collisionLayer.putTileAt(this.collisionFrame, gate.x, gate.y);
    this.animateGate(gate, ['half', 'closed']);
  }

  /** Krata się podnosi: przejście wolne od razu. */
  releaseGate(point: TilePoint): void {
    const gate = this.gateAt(point);
    this.collisionLayer.removeTileAt(gate.x, gate.y);
    this.animateGate(gate, ['half', 'open']);
  }

  private gateAt(point: TilePoint): DressedGate {
    const gate = this.gates.get(pointKey(point));
    if (!gate) throw new Error(`DungeonView: brak kraty w (${point.x}, ${point.y}).`);
    return gate;
  }

  private animateGate(gate: DressedGate, states: readonly GateVisualState[]): void {
    states.forEach((state, i) => {
      this.scene.time.delayedCall(i * ARENA_GATES.frameMs, () => this.gateLayer.putTileAt(gate.frames[state], gate.x, gate.y, false));
    });
  }

  static tileToWorldCenter(point: TilePoint): { x: number; y: number } {
    return { x: (point.x + 0.5) * TILE_SIZE, y: (point.y + 0.5) * TILE_SIZE };
  }

  static worldToTile(x: number, y: number): TilePoint {
    return { x: Math.floor(x / TILE_SIZE), y: Math.floor(y / TILE_SIZE) };
  }
}

function fillLayer(layer: Phaser.Tilemaps.TilemapLayer, data: DressedLayer): void {
  for (let i = 0; i < data.frames.length; i++) {
    const frame = data.frames[i]!;
    if (frame === EMPTY_TILE) continue;
    const tile = layer.putTileAt(frame, i % data.width, Math.floor(i / data.width), false);
    if (data.flipX[i] === 1) tile.flipX = true;
  }
}
