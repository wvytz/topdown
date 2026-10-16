import Phaser from 'phaser';
import { diag } from '@/diagnostics/DiagnosticsHub';
import type { FloorSceneData, HeroSelectData } from '@/core/types';
import { SceneKey, TextureKey } from '@/core/types';
import { BIOMES } from '@/config/biomeConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import type { TilesetMeta } from '@/core/tilesetTypes';
import { registerTorchAnimation } from '@/world/Torches';
import { PROJECTILE_RADIUS } from '@/config/combatConfig';
import { newRun } from '@/systems/RunState';
import { parseStartOverrides } from '@/systems/startOverrides';
import { DEFAULT_HERO, parseHeroId } from '@/config/heroConfig';
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
    // Błędy ładowania zasobów (brak pliku, zła ścieżka, sieć) trafiają do dziennika diagnostycznego (krok 56).
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      diag.note('asset-load-error', { key: file.key, type: file.type, url: file.src }, 'error', `Nie załadowano zasobu „${file.key}”`);
    });
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
    // Bohater z adresu (`?hero=sorceress`) pomija ekran wyboru; bez niego wybór i tak nadpisze domyślnego.
    const hero = heroParam() ?? DEFAULT_HERO;
    // `?floor=`/`?seed=` działają też na Pages, ale wtedy run jest testowy (krok 41g).
    const { practice, ...overrides } = parseStartOverrides(window.location.search);
    const startData: FloorSceneData = { runSeed: Date.now() >>> 0, floor: 1, run: newRun(hero, practice), ...overrides };
    if (this.scene.isActive(SceneKey.Splash)) {
      this.registry.set(BOOT_START_DATA_KEY, startData);
      this.scene.stop();
    } else {
      startFirstFloor(this, startData);
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

/** Bohater podany w adresie (`?hero=sorceress`); null = gracz wybiera na ekranie wyboru. */
function heroParam() {
  return parseHeroId(new URLSearchParams(window.location.search).get('hero'));
}

/** Po ładowaniu (i ekranie startowym): ekran wyboru bohatera, chyba że adres już go podał (krok 38). */
export function startFirstFloor(scene: Phaser.Scene, data: FloorSceneData): void {
  if (heroParam() !== null) {
    scene.scene.start(SceneKey.Game, data);
    return;
  }
  const select: HeroSelectData = { runSeed: data.runSeed, floor: data.floor, practice: data.run.practice ?? false };
  scene.scene.start(SceneKey.Select, select);
}
