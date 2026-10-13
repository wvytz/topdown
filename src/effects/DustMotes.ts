import Phaser from 'phaser';
import type { DustMotesConfig } from '@/config/lightingConfig';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';

const MOTE_TEXTURE = 'tex-mote';

/**
 * Pyłki w powietrzu: jeden emiter (jedno wywołanie rysowania), cząstki 1 px świata w kolorach
 * popiołu z palety, ze stałą alfą. Obszar emisji przesuwamy razem z kadrem kamery, a same
 * cząstki zostają w świecie. Czysto wizualne (Math.random w emiterze jest dozwolony).
 */
export class DustMotes {
  private readonly zone: Phaser.Geom.Rectangle;

  constructor(
    private readonly scene: Phaser.Scene,
    colors: readonly number[],
    config: DustMotesConfig,
  ) {
    if (!scene.textures.exists(MOTE_TEXTURE)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
      g.generateTexture(MOTE_TEXTURE, 1, 1);
      g.destroy();
    }
    this.zone = new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH / CAMERA_CONFIG.zoom, GAME_HEIGHT / CAMERA_CONFIG.zoom);
    scene.add
      .particles(0, 0, MOTE_TEXTURE, {
        emitZone: { type: 'random', source: this.zone, quantity: 1 },
        lifespan: { min: config.lifespanMs.min, max: config.lifespanMs.max },
        speed: { min: config.speed.min, max: config.speed.max },
        angle: { min: 0, max: 360 },
        gravityY: config.gravityY,
        alpha: config.alpha,
        tint: [...colors],
        frequency: config.frequencyMs,
        maxAliveParticles: config.maxParticles,
      })
      .setDepth(RENDER_DEPTH.motes);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.followCamera, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.followCamera, this));
  }

  private followCamera(): void {
    const view = this.scene.cameras.main.worldView;
    this.zone.setPosition(Math.floor(view.x), Math.floor(view.y));
  }
}
