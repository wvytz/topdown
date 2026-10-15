import Phaser from 'phaser';
import type { EnemyVisual } from '@/config/spriteConfig';
import { LIGHTING } from '@/config/lightingConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { pixelEllipse } from '@/systems/lighting';
import { LIGHT_VISIBILITY_KEY } from '@/effects/EnemyVisibility';

type ShadowDef = NonNullable<EnemyVisual['groundShadow']>;

/** Kolor cienia = obrys postaci (STYLEGUIDE §6). */
const SHADOW_COLOR = 0x1b1a22;

/**
 * Cień pod chodzącą postacią: pikselowa elipsa (bez wygładzania) w kolorze obrysu ze stałą alfą 0,4.
 * Idzie za właścicielem po fizyce (POST_UPDATE) i znika razem z nim.
 */
export function attachGroundShadow(owner: Phaser.GameObjects.Sprite, def: ShadowDef): void {
  const scene = owner.scene;
  const key = `tex-shadow-${def.width}x${def.height}`;
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, def.width, def.height);
    const ctx = texture?.getContext();
    if (!texture || !ctx) throw new Error('attachGroundShadow: nie udało się utworzyć tekstury cienia.');
    const mask = pixelEllipse(def.width, def.height);
    const image = ctx.createImageData(def.width, def.height);
    const alpha = Math.round(LIGHTING.groundShadow.alpha * 255);
    mask.forEach((inside, i) => {
      image.data[i * 4] = (SHADOW_COLOR >> 16) & 0xff;
      image.data[i * 4 + 1] = (SHADOW_COLOR >> 8) & 0xff;
      image.data[i * 4 + 2] = SHADOW_COLOR & 0xff;
      image.data[i * 4 + 3] = inside ? alpha : 0;
    });
    ctx.putImageData(image, 0, 0);
    texture.refresh();
  }
  const shadow = scene.add.image(owner.x, owner.y, key).setDepth(RENDER_DEPTH.actorShadow);
  const sync = () => {
    shadow.setPosition(Math.round(owner.x + def.offsetX), Math.round(owner.y + def.offsetY));
    shadow.setVisible(owner.visible);
    // Wróg ukryty w mroku (krok 30) chowa też cień; mruganie gracza (alfa) cienia nie dotyczy.
    shadow.setAlpha((owner.getData(LIGHT_VISIBILITY_KEY) as number | undefined) ?? 1);
  };
  sync();
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, sync);
  owner.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sync);
    shadow.destroy();
  });
}
