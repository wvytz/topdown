import Phaser from 'phaser';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import { DYNAMIC_LIGHT_CONFIG } from '@/config/dynamicLightConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { blackSunAlpha, blackSunFalloff } from '@/systems/DynamicLights';

/** Rozdzielczość tekstury gradientu (skalowana na kadr — gradient jest gładki, więc skala nie robi schodków). */
const TEX_W = 240;
const TEX_H = 135;
const KEY = 'black-sun-gradient';

/**
 * Światło Czarnego Słońca (krok U3, STYLEGUIDE §13.7): zimny, łagodny gradient ADD z prawego górnego narożnika kadru,
 * nad mrokiem, na każdym piętrze z tej samej strony, mocniejszy im wyżej. Przyczepiony do kadru (scrollFactor 0).
 * Widoczny tylko na poziomach z `blackSun` i nigdy przy modyfikatorze „Mrok” (tam ciemność to mechanika piętra).
 */
export class BlackSunLight {
  private readonly image: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, floor: number, private readonly allowed: boolean) {
    if (!scene.textures.exists(KEY)) {
      const texture = scene.textures.createCanvas(KEY, TEX_W, TEX_H);
      const ctx = texture?.getContext();
      if (texture && ctx) {
        const data = ctx.createImageData(TEX_W, TEX_H);
        for (let y = 0; y < TEX_H; y++) {
          for (let x = 0; x < TEX_W; x++) {
            const i = (y * TEX_W + x) * 4;
            data.data[i] = data.data[i + 1] = data.data[i + 2] = 255;
            data.data[i + 3] = Math.round(255 * blackSunFalloff((x + 0.5) / TEX_W, (y + 0.5) / TEX_H));
          }
        }
        ctx.putImageData(data, 0, 0);
        texture.refresh();
      }
    }
    // Obiekt z scrollFactor 0 i tak skaluje się zoomem wokół środka kadru — rozmiar dzielimy przez zoom.
    this.image = scene.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, KEY)
      .setScrollFactor(0)
      .setDisplaySize(GAME_WIDTH / CAMERA_CONFIG.zoom, GAME_HEIGHT / CAMERA_CONFIG.zoom)
      .setDepth(RENDER_DEPTH.blackSun)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(DYNAMIC_LIGHT_CONFIG.blackSun.color)
      .setAlpha(blackSunAlpha(floor))
      .setVisible(false);
  }

  /** Raz na klatkę: włącza się i gaśnie razem z poziomem jakości. */
  update(enabled: boolean): void {
    const visible = enabled && this.allowed;
    if (this.image.visible !== visible) this.image.setVisible(visible);
  }
}
