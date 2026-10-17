import Phaser from 'phaser';
import type { Room } from '@/core/dungeonTypes';
import type { BossHeraldConfig } from '@/config/bossHeraldConfig';
import { CAMERA_CONFIG, GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { roomProximity, rumbleDue } from '@/systems/BossHerald';
import type { RumbleConfig } from '@/systems/BossHerald';
import { DungeonView } from '@/dungeon/DungeonView';

const SPARK_TEXTURE = 'tex-herald-spark';
/** Tempo wygaszania i narastania odcienia (siła/s). */
const TINT_RATE = 0.6;

export interface HeraldDeps {
  readonly scene: Phaser.Scene;
  readonly arena: Room;
  readonly config: BossHeraldConfig;
  readonly rumble: RumbleConfig;
  readonly player: { readonly x: number; readonly y: number };
  /** Zapowiedź milknie, gdy walka z bossem trwa albo już się skończyła. */
  readonly isSilenced: () => boolean;
}

/**
 * Zapowiedź bossa (krok 54, pomysł właściciela): im bliżej areny, tym wyraźniejszy odcień światła, ledwo wyczuwalne
 * drżenie ekranu i (Piekło) iskry z posadzki. Czysto wizualne; w arenie i podczas walki wyciszone. Siła z `systems/BossHerald`.
 */
export class BossHeraldEffects {
  private readonly tint: Phaser.GameObjects.Rectangle | null;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private readonly sparkZone = new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH / CAMERA_CONFIG.zoom, GAME_HEIGHT / CAMERA_CONFIG.zoom);
  private level = 0;
  private lastRumbleAt = 0;
  private lastNow = 0;

  constructor(private readonly deps: HeraldDeps) {
    const { scene, config } = deps;
    this.tint = config.tint
      ? scene.add.rectangle(0, 0, 1, 1, config.tint.color, 0).setOrigin(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(RENDER_DEPTH.torchGlow - 0.1)
      : null;
    this.sparks = config.sparks ? this.createSparks(config.sparks) : null;
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.followCamera, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.followCamera, this));
  }

  /** Siła zapowiedzi w miejscu gracza (0 w arenie i podczas walki). */
  strength(): number {
    const { arena, config, player, isSilenced } = this.deps;
    if (isSilenced()) return 0;
    const tile = DungeonView.worldToTile(player.x, player.y);
    const inside = tile.x >= arena.x && tile.x < arena.x + arena.width && tile.y >= arena.y && tile.y < arena.y + arena.height;
    return inside ? 0 : roomProximity(tile, arena, config.radiusTiles);
  }

  update(now: number): void {
    const dt = this.lastNow === 0 ? 0 : Math.min(250, now - this.lastNow) / 1000;
    this.lastNow = now;
    const strength = this.strength();
    const step = TINT_RATE * dt;
    this.level = strength > this.level ? Math.min(strength, this.level + step) : Math.max(strength, this.level - step);
    this.tint?.setAlpha((this.deps.config.tint?.maxAlpha ?? 0) * this.level);

    const camera = this.deps.scene.cameras.main;
    if (rumbleDue(strength, now, this.lastRumbleAt, this.deps.rumble) && !camera.shakeEffect.isRunning) {
      camera.shake(this.deps.rumble.durationMs, this.deps.rumble.intensity * strength);
      this.lastRumbleAt = now;
    }
    this.updateSparks(strength);
  }

  private createSparks(config: NonNullable<BossHeraldConfig['sparks']>): Phaser.GameObjects.Particles.ParticleEmitter {
    const { scene } = this.deps;
    if (!scene.textures.exists(SPARK_TEXTURE)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
      g.generateTexture(SPARK_TEXTURE, 2, 2);
      g.destroy();
    }
    const emitter = scene.add.particles(0, 0, SPARK_TEXTURE, {
      emitZone: { type: 'random', source: this.sparkZone, quantity: 1 },
      lifespan: { min: config.lifespanMs.min, max: config.lifespanMs.max },
      speedY: { min: -config.speedUp.max, max: -config.speedUp.min },
      speedX: { min: -6, max: 6 },
      alpha: { start: 0.9, end: 0 },
      tint: [...config.colors],
      frequency: config.frequencyMs,
      maxAliveParticles: config.maxParticles,
      emitting: false,
    });
    emitter.setDepth(RENDER_DEPTH.torchGlow);
    return emitter;
  }

  private updateSparks(strength: number): void {
    const sparks = this.deps.config.sparks;
    if (!this.sparks || !sparks) return;
    if (strength < 0.08) {
      if (this.sparks.emitting) this.sparks.stop();
      return;
    }
    // Im bliżej areny, tym gęściej: odstęp rośnie, gdy siła słabnie.
    this.sparks.frequency = sparks.frequencyMs / strength;
    if (!this.sparks.emitting) this.sparks.start();
  }

  private followCamera(): void {
    const view = this.deps.scene.cameras.main.worldView;
    this.sparkZone.setPosition(Math.floor(view.x), Math.floor(view.y));
    this.tint?.setPosition(view.x, view.y).setSize(view.width, view.height);
  }
}
