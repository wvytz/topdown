import Phaser from 'phaser';
import { ECTOPLASM_VISUAL } from '@/config/spriteConfig';
import { buildLightStamp } from '@/systems/lighting';
import { stampTexture } from '@/effects/lightTextures';

const HALO_RADIUS = 32;
const DROP_TEXTURE = 'tex-ectoplasm-drop';

interface EctoplasmOwner extends Phaser.GameObjects.Sprite {
  readonly radius: number;
}

/**
 * Ektoplazma ducha (krok 183a): miękka poświata ADD, która oddycha jak lampki Grzybni, i kropelki kapiące
 * z ciała. Gaśnie razem z duchem (przenikanie = przygaszona), znika z nim. Czysto wizualne — Math.random wolno.
 */
export function attachEctoplasm(owner: EctoplasmOwner): void {
  const scene = owner.scene;
  const v = ECTOPLASM_VISUAL;
  const key = stampTexture(scene, 'ectoplasm-halo', () => buildLightStamp(HALO_RADIUS, (d) => Math.max(0, 1 - d / HALO_RADIUS) ** 2), 0xffffff);
  if (!scene.textures.exists(DROP_TEXTURE)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
    g.generateTexture(DROP_TEXTURE, 2, 2);
    g.destroy();
  }
  const depth = owner.depth - 0.01;
  const halo = scene.add.image(owner.x, owner.y, key).setTint(v.tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
  const baseScale = (owner.radius * v.haloScale) / HALO_RADIUS;
  const phase = Math.random() * Math.PI * 2;
  const drips = scene.add
    .particles(0, 0, DROP_TEXTURE, {
      lifespan: { min: v.drip.lifespanMs.min, max: v.drip.lifespanMs.max },
      speedX: { min: -4, max: 4 },
      speedY: { min: v.drip.fallSpeed.min, max: v.drip.fallSpeed.max },
      alpha: { start: v.drip.alpha, end: 0 },
      scale: { start: 1, end: 0.4 },
      tint: v.tint,
      blendMode: Phaser.BlendModes.ADD,
      frequency: v.drip.frequencyMs,
      emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, owner.radius * 0.8), quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    })
    .setDepth(depth);
  drips.startFollow(owner);

  const sync = (): void => {
    const breath = 1 - v.pulseDepth + v.pulseDepth * Math.sin((scene.time.now / v.pulseMs) * Math.PI * 2 + phase);
    const alpha = owner.visible ? owner.alpha : 0;
    halo.setPosition(owner.x, owner.y).setScale(baseScale * (0.92 + 0.08 * breath)).setAlpha(alpha * v.haloAlpha * breath);
    drips.emitting = alpha > 0.4;
  };
  sync();
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, sync);
  owner.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sync);
    halo.destroy();
    drips.stop();
    scene.time.delayedCall(v.drip.lifespanMs.max, () => drips.destroy());
  });
}
