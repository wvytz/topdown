import Phaser from 'phaser';
import type { TilesetMeta } from '@/core/tilesetTypes';
import { LIGHTING } from '@/config/lightingConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { SPRITE_FPS } from '@/config/spriteConfig';
import { TILESET_ASSET } from '@/config/tilesetConfig';
import type { TorchSpot } from '@/dungeon/LightPlanner';
import type { PointLight } from '@/effects/LightingOverlay';
import { torchLightKey } from '@/effects/LightingOverlay';
import { hexColor } from '@/effects/lightTextures';
import { flickerRadius } from '@/systems/lighting';

export const TORCH_FLAME_ANIMATION = 'torch-flame';

/** Animacja płomienia z klatek arkusza (grupa „torchFlame”), 6 kl./s jak postacie. Wywoływane raz w BootScene. */
export function registerTorchAnimation(scene: Phaser.Scene, tileset: TilesetMeta): void {
  if (scene.anims.exists(TORCH_FLAME_ANIMATION)) return;
  const frames = (tileset.groups.torchFlame ?? []).map((name) => tileset.tiles[name]?.frame ?? 0);
  scene.anims.create({
    key: TORCH_FLAME_ANIMATION,
    frames: scene.anims.generateFrameNumbers(TILESET_ASSET.sheetKey, { frames }),
    frameRate: SPRITE_FPS,
    repeat: -1,
  });
}

interface MutableLight extends PointLight {
  radius: number;
}

/**
 * Pochodnie z planu (czysty LightPlanner): uchwyt na licu muru, animowany płomień nad mrokiem,
 * ciepła poświata (ADD) i światło dla LightingOverlay. Migotanie to skoki promienia w rytmie
 * klatek płomienia — bez płynnego falowania (pixel art). Math.random: efekt czysto wizualny.
 */
export class Torches {
  readonly lights: readonly PointLight[];

  constructor(scene: Phaser.Scene, spots: readonly TorchSpot[], tileset: TilesetMeta, options: { readonly glow: boolean }) {
    const sconceFrame = tileset.tiles.torch_sconce?.frame;
    if (sconceFrame === undefined) throw new Error('Torches: brak kafla „torch_sconce” w arkuszu.');
    const { radius, flickerOffsets, glowAlpha } = LIGHTING.torch;
    const glowTint = hexColor(tileset.colors.flame[1] ?? '#d36c00');
    const lights: MutableLight[] = [];

    for (const spot of spots) {
      const x = spot.x * TILE_SIZE;
      const y = spot.y * TILE_SIZE;
      scene.add.image(x, y, TILESET_ASSET.sheetKey, sconceFrame).setOrigin(0).setDepth(RENDER_DEPTH.wallDecor);
      const flame = scene.add.sprite(x, y, TILESET_ASSET.sheetKey).setOrigin(0).setDepth(RENDER_DEPTH.torchFlame);
      flame.play({ key: TORCH_FLAME_ANIMATION, startFrame: Math.floor(Math.random() * 4) });

      const light: MutableLight = { x: x + TILE_SIZE / 2, y: y + tileset.torch.flameBaseY - 3, radius };
      lights.push(light);
      const glow = scene.add
        .image(light.x, light.y, torchLightKey(scene, radius))
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(glowTint)
        .setAlpha(glowAlpha)
        .setDepth(RENDER_DEPTH.torchGlow)
        .setVisible(options.glow);
      flame.on(Phaser.Animations.Events.ANIMATION_UPDATE, () => {
        light.radius = flickerRadius(radius, flickerOffsets, Math.random());
        glow.setTexture(torchLightKey(scene, light.radius));
      });
    }
    this.lights = lights;
  }
}
