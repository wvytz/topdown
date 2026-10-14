import type Phaser from 'phaser';
import type { SpriteSheetDef, SpriteSheetId } from '@/config/spriteConfig';
import { LOOT_ANIMATIONS, LOOT_ATLAS, SPRITE_SHEETS, animationKey, itemFrames, lootAnimationKey } from '@/config/spriteConfig';
import type { LootAnimation } from '@/config/spriteConfig';
import { ITEM_POOL } from '@/config/lootConfig';
import { ItemKind } from '@/core/lootTypes';
import { sheetFrameIndex } from '@/systems/Facing';

/** Ładuje wszystkie arkusze sprite'ów (wywoływać w preload sceny startowej). */
export function loadSpriteSheets(scene: Phaser.Scene): void {
  for (const sheet of Object.values(SPRITE_SHEETS) as SpriteSheetDef[]) {
    scene.load.spritesheet(sheet.key, sheet.url, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
  }
  scene.load.atlas(LOOT_ATLAS.key, LOOT_ATLAS.textureUrl, LOOT_ATLAS.atlasUrl);
}

/** Animacje atlasu łupów (moneta, pociski, kapliczka) i iskry przedmiotów z efektem — 6 kl./s, w pętli. */
export function registerLootAnimations(scene: Phaser.Scene): void {
  const create = (key: string, frames: readonly string[]) => {
    if (scene.anims.exists(key)) return;
    scene.anims.create({
      key,
      frames: frames.map((frame) => ({ key: LOOT_ATLAS.key, frame })),
      frameRate: LOOT_ATLAS.fps,
      repeat: -1,
    });
  };
  for (const [name, frames] of Object.entries(LOOT_ANIMATIONS) as Array<[LootAnimation, readonly string[]]>) {
    create(lootAnimationKey(name), frames);
  }
  for (const item of ITEM_POOL) {
    if (item.kind === ItemKind.Effect) create(lootAnimationKey(`item-${item.id}`), itemFrames(item.id, item.kind));
  }
}

/** Rejestruje animacje: osobna dla każdej pary (animacja, kierunek). Klucze z `animationKey`. */
export function registerSpriteAnimations(scene: Phaser.Scene): void {
  for (const [id, sheet] of Object.entries(SPRITE_SHEETS) as Array<[SpriteSheetId, SpriteSheetDef]>) {
    const columns = sheet.sheetWidth / sheet.frameWidth;
    for (const [name, animation] of Object.entries(sheet.animations)) {
      for (let direction = 0; direction < sheet.directions; direction++) {
        const key = animationKey(id, name, direction);
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frames: animation.frames.map((column) => ({
            key: sheet.key,
            frame: sheetFrameIndex(direction, column, columns),
          })),
          frameRate: animation.fps ?? sheet.fps,
          repeat: animation.loop ? -1 : 0,
        });
      }
    }
  }
}
