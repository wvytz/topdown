import Phaser from 'phaser';
import type { FloorSceneData } from '@/core/types';
import { SceneKey, TextureKey } from '@/core/types';
import { TILESET_ASSET } from '@/config/tilesetConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import type { TilesetMeta } from '@/core/tilesetTypes';
import { registerTorchAnimation } from '@/world/Torches';
import { PROJECTILE_RADIUS } from '@/config/combatConfig';
import { NEW_RUN } from '@/systems/RunState';
import { loadSpriteSheets, registerLootAnimations, registerSpriteAnimations } from '@/effects/spriteAnimations';

/** Ładuje arkusze sprite'ów i kafli, generuje placeholderowe tekstury (geometria) i przechodzi do gry. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  preload(): void {
    loadSpriteSheets(this);
    this.load.image(TILESET_ASSET.imageKey, TILESET_ASSET.imageUrl);
    this.load.json(TILESET_ASSET.jsonKey, TILESET_ASSET.jsonUrl);
    this.load.spritesheet(TILESET_ASSET.sheetKey, TILESET_ASSET.imageUrl, { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE });
  }

  create(): void {
    registerSpriteAnimations(this);
    registerLootAnimations(this);
    registerTorchAnimation(this, this.cache.json.get(TILESET_ASSET.jsonKey) as TilesetMeta);
    this.generatePlaceholderTextures();
    const startData: FloorSceneData = { runSeed: Date.now() >>> 0, floor: 1, run: NEW_RUN };
    this.scene.start(SceneKey.Game, startData);
  }

  private generatePlaceholderTextures(): void {
    // Łupy, kapliczka, pocisk gracza i znacznik celowania mają sprite'y z atlasu (krok 20).
    // Zostaje tylko domyślny pocisk wroga — używany, gdy pocisk nie ma własnego wyglądu.
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const p = PROJECTILE_RADIUS;
    g.fillStyle(0xffa040, 1).fillCircle(p, p, p);
    g.fillStyle(0xfff0c0, 1).fillCircle(p, p, p / 2);
    g.generateTexture(TextureKey.Projectile, p * 2, p * 2);
    g.destroy();
  }
}
