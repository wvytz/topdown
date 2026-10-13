import Phaser from 'phaser';
import type { FloorSceneData } from '@/core/types';
import { SceneKey, TextureKey } from '@/core/types';
import { TILESET_ASSET } from '@/config/tilesetConfig';
import { PLAYER_COMBAT, PROJECTILE_RADIUS } from '@/config/combatConfig';
import { ITEM_POOL } from '@/config/lootConfig';
import { ItemKind } from '@/core/lootTypes';
import { itemTextureKey } from '@/entities/Pickup';
import { NEW_RUN } from '@/systems/RunState';
import { loadSpriteSheets, registerSpriteAnimations } from '@/effects/spriteAnimations';

/** Ładuje arkusze sprite'ów i kafli, generuje placeholderowe tekstury (geometria) i przechodzi do gry. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  preload(): void {
    loadSpriteSheets(this);
    this.load.image(TILESET_ASSET.imageKey, TILESET_ASSET.imageUrl);
    this.load.json(TILESET_ASSET.jsonKey, TILESET_ASSET.jsonUrl);
  }

  create(): void {
    registerSpriteAnimations(this);
    this.generatePlaceholderTextures();
    const startData: FloorSceneData = { runSeed: Date.now() >>> 0, floor: 1, run: NEW_RUN };
    this.scene.start(SceneKey.Game, startData);
  }

  private generatePlaceholderTextures(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // Gracz i zwykli wrogowie mają sprite'y z arkuszy (preload); tu tylko placeholdery reszty.
    // Znacznik celowania: trójkąt skierowany w prawo (obracany wg kąta celowania).
    g.fillStyle(0xffffff, 0.9).fillTriangle(0, 0, 10, 5, 0, 10);
    g.generateTexture(TextureKey.AimMarker, 10, 10);
    g.clear();

    const p = PROJECTILE_RADIUS;
    g.fillStyle(0xffa040, 1).fillCircle(p, p, p);
    g.fillStyle(0xfff0c0, 1).fillCircle(p, p, p / 2);
    g.generateTexture(TextureKey.Projectile, p * 2, p * 2);
    g.clear();

    // Pocisk gracza: turkus jak ładunki w HUD (odróżnia się od pomarańczowych pocisków wrogów).
    const s = PLAYER_COMBAT.ranged.projectileRadius;
    g.fillStyle(0x5ee0c8, 1).fillCircle(s, s, s);
    g.fillStyle(0xe8fff8, 1).fillCircle(s, s, s / 2);
    g.generateTexture(TextureKey.PlayerShot, s * 2, s * 2);
    g.clear();

    // Moneta: złote kółko z ciemniejszym obrysem.
    g.fillStyle(0xf5c542, 1).fillCircle(5, 5, 5);
    g.lineStyle(1, 0x9a7414, 1).strokeCircle(5, 5, 4.5);
    g.fillStyle(0xfff3b0, 1).fillCircle(4, 4, 1.5);
    g.generateTexture(TextureKey.Coin, 10, 10);
    g.clear();

    // Mikstura zdrowia: czerwone kółko z białym krzyżem.
    g.fillStyle(0xd93a5a, 1).fillCircle(7, 7, 7);
    g.fillStyle(0xffffff, 1).fillRect(5.5, 3, 3, 8).fillRect(3, 5.5, 8, 3);
    g.generateTexture(TextureKey.HealthPotion, 14, 14);
    g.clear();

    // Przedmioty bazowe: romb z białym obrysem. Przedmioty z efektem: większa gwiazda ze złotym obrysem.
    for (const item of ITEM_POOL) {
      if (item.kind === ItemKind.Effect) {
        const star = starPoints(10, 10, 10, 4.5, 4);
        g.fillStyle(item.color, 1).fillPoints(star, true);
        g.lineStyle(2, 0xf5c542, 1).strokePoints(star, true);
        g.generateTexture(itemTextureKey(item.id), 20, 20);
      } else {
        g.fillStyle(item.color, 1).fillPoints([{ x: 8, y: 0 }, { x: 16, y: 8 }, { x: 8, y: 16 }, { x: 0, y: 8 }], true);
        g.lineStyle(2, 0xffffff, 0.9).strokePoints([{ x: 8, y: 1 }, { x: 15, y: 8 }, { x: 8, y: 15 }, { x: 1, y: 8 }], true);
        g.generateTexture(itemTextureKey(item.id), 16, 16);
      }
      g.clear();
    }

    // Kapliczka: kamienny postument ze świecącą kulą (aktywna) lub zgasłą (użyta).
    for (const [key, orb] of [[TextureKey.Shrine, 0xffd76a], [TextureKey.ShrineUsed, 0x4a4a58]] as const) {
      g.fillStyle(0x6b6478, 1).fillRect(4, 14, 16, 10);
      g.fillStyle(0x857d94, 1).fillRect(2, 12, 20, 4);
      g.fillStyle(orb, 1).fillCircle(12, 7, 6);
      if (key === TextureKey.Shrine) g.fillStyle(0xffffff, 0.8).fillCircle(10, 5, 2);
      g.generateTexture(key, 24, 24);
      g.clear();
    }

    g.destroy();
  }
}

/** Wierzchołki gwiazdy o `points` ramionach (naprzemiennie promień zewnętrzny i wewnętrzny). */
function starPoints(cx: number, cy: number, outer: number, inner: number, points: number): Phaser.Math.Vector2[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? outer - 1 : inner;
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    return new Phaser.Math.Vector2(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  });
}
