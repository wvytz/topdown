import Phaser from 'phaser';
import type { FloorSceneData } from '@/core/types';
import { SceneKey, TextureKey } from '@/core/types';
import { BIOMES } from '@/config/biomeConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import type { TilesetMeta } from '@/core/tilesetTypes';
import { registerTorchAnimation } from '@/world/Torches';
import { PROJECTILE_RADIUS } from '@/config/combatConfig';
import { NEW_RUN } from '@/systems/RunState';
import { loadSpriteSheets, registerLootAnimations, registerSpriteAnimations } from '@/effects/spriteAnimations';

/** Klucz rejestru: dane startu pierwszego piętra, gdy ekran startowy jeszcze trwa (krok 34). */
export const BOOT_START_DATA_KEY = 'bootStartData';

/**
 * Ładuje arkusze sprite'ów i kafli, generuje placeholderowe tekstury (geometria) i przechodzi do gry.
 * Uruchamia ją SplashScene; jeśli ekran startowy jeszcze trwa, BootScene zostawia mu dane startu.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  preload(): void {
    loadSpriteSheets(this);
    // Arkusze kafli wszystkich biomów (krok 23a) — piętro wybiera swój w GameScene.
    for (const { tileset } of Object.values(BIOMES)) {
      this.load.image(tileset.imageKey, tileset.imageUrl);
      this.load.json(tileset.jsonKey, tileset.jsonUrl);
      this.load.spritesheet(tileset.sheetKey, tileset.imageUrl, { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE });
    }
  }

  create(): void {
    registerSpriteAnimations(this);
    registerLootAnimations(this);
    for (const { tileset } of Object.values(BIOMES)) {
      registerTorchAnimation(this, tileset, this.cache.json.get(tileset.jsonKey) as TilesetMeta);
    }
    this.generatePlaceholderTextures();
    const startData: FloorSceneData = { runSeed: Date.now() >>> 0, floor: 1, run: NEW_RUN, ...devStartOverrides() };
    if (this.scene.isActive(SceneKey.Splash)) {
      this.registry.set(BOOT_START_DATA_KEY, startData);
      this.scene.stop();
    } else {
      this.scene.start(SceneKey.Game, startData);
    }
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

/** Tylko w trybie dev: `?seed=3&floor=2` w adresie startuje run od danego seeda i piętra (testy modyfikatorów). */
function devStartOverrides(): Partial<Pick<FloorSceneData, 'runSeed' | 'floor'>> {
  if (!import.meta.env.DEV) return {};
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed'));
  const floor = Number(params.get('floor'));
  return {
    ...(params.has('seed') && Number.isInteger(seed) ? { runSeed: seed >>> 0 } : {}),
    ...(params.has('floor') && Number.isInteger(floor) && floor >= 1 ? { floor } : {}),
  };
}
