import Phaser from 'phaser';
import { STAIRS_GLOW } from '@/config/stairsGlowConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import type { TilePoint } from '@/core/dungeonTypes';
import type { PointLight } from '@/effects/LightingOverlay';
import { screenFx } from '@/effects/ScreenFx';

const MOTE_TEXTURE = 'tex-stairs-mote';

/**
 * Otwarte schody (krok 186): światło z wyższego piętra rozjaśnia mrok nad łukiem, a złote pyłki
 * wznoszą się po stopniach ku górze. Do otwarcia — nic. Math.random w emiterze: efekt czysto wizualny.
 */
export class StairsGlow {
  private light: PointLight | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly anchor: TilePoint,
  ) {}

  get lights(): readonly PointLight[] {
    return this.light ? [this.light] : [];
  }

  open(): void {
    if (this.light) return;
    const x0 = this.anchor.x * TILE_SIZE;
    const y0 = this.anchor.y * TILE_SIZE;
    const cfg = STAIRS_GLOW;
    this.light = { x: x0 + TILE_SIZE, y: y0 + TILE_SIZE + cfg.lightOffsetY, radius: cfg.lightRadius };
    if (!this.scene.textures.exists(MOTE_TEXTURE)) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
      g.generateTexture(MOTE_TEXTURE, 1, 1);
      g.destroy();
    }
    const zone = new Phaser.Geom.Rectangle(x0 + cfg.emitZone.x, y0 + cfg.emitZone.y, cfg.emitZone.width, cfg.emitZone.height);
    this.scene.add
      .particles(0, 0, MOTE_TEXTURE, {
        emitZone: { type: 'random', source: zone, quantity: 1 },
        lifespan: { min: cfg.lifespanMs.min, max: cfg.lifespanMs.max },
        speedY: { min: -cfg.riseSpeed.max, max: -cfg.riseSpeed.min },
        speedX: { min: -2, max: 2 },
        alpha: { start: cfg.alpha, end: 0 },
        tint: [...cfg.moteColors],
        frequency: cfg.frequencyMs,
        maxAliveParticles: screenFx.particles(cfg.maxParticles),
      })
      .setDepth(RENDER_DEPTH.motes);
  }
}
