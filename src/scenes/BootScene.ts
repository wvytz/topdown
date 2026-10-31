import Phaser from 'phaser';
import { diag } from '@/diagnostics/DiagnosticsHub';
import type { FloorSceneData } from '@/core/types';
import type { SplashSceneData } from '@/scenes/SplashScene';
import { SceneKey, TextureKey } from '@/core/types';
import { BIOMES } from '@/config/biomeConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import type { TilesetMeta } from '@/core/tilesetTypes';
import { registerTorchAnimation } from '@/world/Torches';
import { PROJECTILE_RADIUS } from '@/config/combatConfig';
import { newRun } from '@/systems/RunState';
import { parseStartOverrides } from '@/systems/startOverrides';
import { withPracticeLoadout } from '@/scenes/practiceStart';
import { DEFAULT_HERO, HERO_ORDER, parseHeroId } from '@/config/heroConfig';
import { freshCoop, partnerHero } from '@/systems/Coop';
import { BOSS_RUSH_CONFIG } from '@/config/bossRushConfig';
import { RunMode } from '@/core/runMode';
import { parseRunMode } from '@/systems/BossRush';
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
    // `?mode=arenas` (krok 90): od razu areny bossów; ekran wyboru i tak pozwala zmienić tryb.
    const mode = parseRunMode(window.location.search, BOSS_RUSH_CONFIG.urlParam, BOSS_RUSH_CONFIG.urlValue) ?? RunMode.Tower;
    // Co-op w trybie testowym (krok 103): `?hero=barbarian&coop=archer` — P1 na klawiaturze z myszą, P2 na padzie.
    // Tylko wspinaczka (decyzja właściciela); do czasu tablicy co-op (etap C7) run jest testowy.
    const coopWanted = heroParam() !== null && mode === RunMode.Tower ? parseHeroId(new URLSearchParams(window.location.search).get('coop')) : null;
    const coop = coopWanted ? freshCoop(partnerHero(hero, coopWanted, HERO_ORDER)) : undefined;
    const startData = withPracticeLoadout(
      {
        runSeed: Date.now() >>> 0,
        floor: 1,
        run: newRun(hero, practice || coop !== undefined, mode),
        ...overrides,
        ...(coop && { coop }),
      },
      practice,
    );
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

/** Bohater podany w adresie (`?hero=sorceress`); null = gracz wybiera w menu i na ekranie wyboru. */
export function heroParam() {
  return parseHeroId(new URLSearchParams(window.location.search).get('hero'));
}

/**
 * Po ładowaniu: z `?hero=` w adresie od razu gra (testy, smoke), bez niego — menu główne na tle ekranu startowego
 * (krok 91). Zwykle menu otwiera sam ekran startowy; tu trafiamy, gdy ekran startowy już się skończył.
 */
export function startFirstFloor(scene: Phaser.Scene, data: FloorSceneData): void {
  if (heroParam() !== null) {
    scene.scene.start(SceneKey.Game, data);
    return;
  }
  openMainMenu(scene, data);
}

/** Menu główne: ekran startowy bez intra jako tło i menu na nim (także powrót z gry). */
export function openMainMenu(scene: Phaser.Scene, start: FloorSceneData): void {
  const splash: SplashSceneData = { menu: { start } };
  scene.scene.start(SceneKey.Splash, splash);
}
