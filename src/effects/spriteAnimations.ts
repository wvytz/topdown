import type Phaser from 'phaser';
import type { SpriteSheetDef, SpriteSheetId } from '@/config/spriteConfig';
import { SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { sheetFrameIndex } from '@/systems/Facing';

/** Ładuje wszystkie arkusze sprite'ów (wywoływać w preload sceny startowej). */
export function loadSpriteSheets(scene: Phaser.Scene): void {
  for (const sheet of Object.values(SPRITE_SHEETS) as SpriteSheetDef[]) {
    scene.load.spritesheet(sheet.key, sheet.url, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
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
          frameRate: sheet.fps,
          repeat: animation.loop ? -1 : 0,
        });
      }
    }
  }
}
