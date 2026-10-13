import type Phaser from 'phaser';
import type { DungeonFloor } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { TilesetMeta } from '@/core/tilesetTypes';
import type { CombatDecalKind, FloorDressingConfig } from '@/config/dressingConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { TILESET_ASSET } from '@/config/tilesetConfig';
import { RingBuffer } from '@/systems/RingBuffer';

/**
 * Trwałe ślady walki (plamy, przypalenia, szlam) w puli o stałej pojemności (bufor kołowy FIFO).
 * Do zapełnienia puli tworzymy obrazki, potem najstarszy jest używany ponownie (nowa klatka i pozycja) —
 * w trakcie walki nic nie powstaje ani nie znika. Czysto wizualne (Math.random dozwolony).
 */
export class CombatDecals {
  private readonly ring: RingBuffer<Phaser.GameObjects.Image>;
  private readonly frames: Readonly<Record<CombatDecalKind, readonly number[]>>;
  private created = 0;
  private recycled = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly floor: DungeonFloor,
    tileset: TilesetMeta,
    config: FloorDressingConfig['combatDecals'],
  ) {
    this.ring = new RingBuffer(config.capacity);
    const framesOf = (kind: CombatDecalKind) => {
      const names = tileset.groups[config.groups[kind]];
      if (!names || names.length === 0) throw new Error(`CombatDecals: brak grupy „${config.groups[kind]}” w arkuszu.`);
      return names.map((name) => tileset.tiles[name]?.frame ?? 0);
    };
    this.frames = { splat: framesOf('splat'), scorch: framesOf('scorch'), slime: framesOf('slime') };
  }

  /** Statystyki puli (debug/weryfikacja): aktywne ślady, utworzone obiekty, ponowne użycia. */
  get stats(): { readonly active: number; readonly created: number; readonly recycled: number; readonly capacity: number } {
    return { active: this.ring.size, created: this.created, recycled: this.recycled, capacity: this.ring.capacity };
  }

  add(kind: CombatDecalKind, x: number, y: number): void {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.floor.width || ty >= this.floor.height) return;
    if (this.floor.tiles[ty * this.floor.width + tx] === TileType.Wall) return; // ślady tylko na podłodze

    const options = this.frames[kind];
    const frame = options[Math.floor(Math.random() * options.length)] ?? options[0]!;
    let image: Phaser.GameObjects.Image;
    if (this.ring.isFull) {
      image = this.ring.oldest()!;
      this.recycled++;
    } else {
      image = this.scene.add.image(0, 0, TILESET_ASSET.sheetKey, frame).setDepth(RENDER_DEPTH.combatDecal);
      this.created++;
    }
    image.setFrame(frame).setPosition(Math.round(x), Math.round(y)).setFlipX(Math.random() < 0.5);
    this.ring.push(image);
  }
}
