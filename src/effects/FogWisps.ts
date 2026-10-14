import Phaser from 'phaser';
import type { FogConfig } from '@/config/lightingConfig';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';

const WISP_TEXTURE = 'tex-fog-wisp';

/**
 * Dryfujące obłoczki mgły (krok 28a, Grzybnia): twarde elipsy w kolorze mgły ze stałą alfą, wolno płynące
 * nad postaciami i pod warstwą mgły (blisko bohatera widać je wyraźnie, dalej toną w mgle).
 * Jeden emiter; obszar emisji podąża za kadrem jak pyłki. Czysto wizualne (Math.random w emiterze).
 */
export class FogWisps {
  private readonly zone: Phaser.Geom.Rectangle;

  constructor(
    private readonly scene: Phaser.Scene,
    fog: FogConfig,
  ) {
    const { wisps } = fog;
    if (!scene.textures.exists(WISP_TEXTURE)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillEllipse(wisps.width / 2, wisps.height / 2, wisps.width, wisps.height);
      g.generateTexture(WISP_TEXTURE, wisps.width, wisps.height);
      g.destroy();
    }
    this.zone = new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH / CAMERA_CONFIG.zoom, GAME_HEIGHT / CAMERA_CONFIG.zoom);
    scene.add
      .particles(0, 0, WISP_TEXTURE, {
        emitZone: { type: 'random', source: this.zone, quantity: 1 },
        lifespan: { min: wisps.lifespanMs.min, max: wisps.lifespanMs.max },
        speed: { min: wisps.speed.min, max: wisps.speed.max },
        // Mgła snuje się poziomo (w lewo albo w prawo).
        angle: { min: -12, max: 12 },
        scale: { min: wisps.scale.min, max: wisps.scale.max },
        alpha: wisps.alpha,
        tint: fog.color,
        frequency: wisps.frequencyMs,
        maxAliveParticles: wisps.maxParticles,
      })
      .setDepth(RENDER_DEPTH.fogWisps);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.followCamera, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.followCamera, this));
  }

  private followCamera(): void {
    const view = this.scene.cameras.main.worldView;
    this.zone.setPosition(Math.floor(view.x), Math.floor(view.y));
  }
}
