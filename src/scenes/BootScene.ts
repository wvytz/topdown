import Phaser from 'phaser';
import type { FloorSceneData } from '@/core/types';
import { SceneKey, TextureKey } from '@/core/types';
import { TileType } from '@/core/dungeonTypes';
import { TILE_SIZE } from '@/config/gameConfig';
import { TILESET_FRAMES } from '@/dungeon/DungeonView';
import { PLAYER_COMBAT, PROJECTILE_RADIUS } from '@/config/combatConfig';
import { FLOOR_GUARDIAN } from '@/config/bossConfig';
import { ITEM_POOL } from '@/config/lootConfig';
import { ItemKind } from '@/core/lootTypes';
import { itemTextureKey } from '@/entities/Pickup';
import { NEW_RUN } from '@/systems/RunState';
import { loadSpriteSheets, registerSpriteAnimations } from '@/effects/spriteAnimations';

/** Ładuje arkusze sprite'ów, generuje placeholderowe tekstury (geometria) i przechodzi do gry. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  preload(): void {
    loadSpriteSheets(this);
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

    // Boss: duże koło z ciemnym pierścieniem i jasnym rdzeniem.
    const b = FLOOR_GUARDIAN.radius;
    g.fillStyle(FLOOR_GUARDIAN.color, 1).fillCircle(b, b, b);
    g.lineStyle(4, 0x2a0f0a, 0.8).strokeCircle(b, b, b - 6);
    g.fillStyle(0xffd27a, 1).fillCircle(b, b, b / 4);
    g.generateTexture(TextureKey.Boss, b * 2, b * 2);
    g.clear();

    this.drawTileset(g);
    g.generateTexture(TextureKey.Tileset, TILE_SIZE * TILESET_FRAMES.length, TILE_SIZE);

    g.destroy();
  }

  /** Rysuje pasek kafli w kolejności TILESET_FRAMES (indeks klatki = indeks kafla w tilemapie). */
  private drawTileset(g: Phaser.GameObjects.Graphics): void {
    const s = TILE_SIZE;
    TILESET_FRAMES.forEach((type, frame) => {
      const ox = frame * s;
      switch (type) {
        case TileType.Wall:
          g.fillStyle(0x3a3346, 1).fillRect(ox, 0, s, s);
          g.fillStyle(0x4b4259, 1).fillRect(ox, 0, s, 6); // jaśniejsza krawędź = złudzenie wysokości
          g.lineStyle(1, 0x221e2b, 1).strokeRect(ox + 0.5, 0.5, s - 1, s - 1);
          break;
        case TileType.Floor:
          g.fillStyle(0x24242c, 1).fillRect(ox, 0, s, s);
          g.lineStyle(1, 0x2f2f3a, 1).strokeRect(ox + 0.5, 0.5, s - 1, s - 1);
          break;
        case TileType.StairsLocked:
          g.fillStyle(0x24242c, 1).fillRect(ox, 0, s, s);
          g.fillStyle(0x6b2a2a, 1).fillRect(ox + 4, 4, s - 8, s - 8);
          g.lineStyle(2, 0xc04848, 1).strokeRect(ox + 4, 4, s - 8, s - 8);
          for (let bar = 10; bar < s - 4; bar += 6) g.fillStyle(0xc04848, 1).fillRect(ox + bar, 4, 2, s - 8);
          break;
        case TileType.StairsOpen:
          g.fillStyle(0x24242c, 1).fillRect(ox, 0, s, s);
          for (let step = 0; step < 4; step++) {
            g.fillStyle(step % 2 === 0 ? 0xe0b84a : 0xb38a2a, 1).fillRect(ox + 4 + step * 3, 4 + step * 6, s - 8 - step * 6, 6);
          }
          break;
        case TileType.Gate:
          // Żelazna krata: pionowe pręty i dwie poprzeczki na tle podłogi.
          g.fillStyle(0x24242c, 1).fillRect(ox, 0, s, s);
          for (let bar = 3; bar < s; bar += 7) g.fillStyle(0x8a8f9c, 1).fillRect(ox + bar, 0, 3, s);
          g.fillStyle(0x5c606b, 1).fillRect(ox, 7, s, 3).fillRect(ox, s - 10, s, 3);
          g.lineStyle(1, 0xff8a3c, 0.9).strokeRect(ox + 0.5, 0.5, s - 1, s - 1);
          break;
      }
    });
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
