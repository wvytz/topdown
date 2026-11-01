import Phaser from 'phaser';
import type { BiomeAmbientConfig, ScuttlerConfig } from '@/config/ambientConfig';
import { AmbientKind } from '@/config/ambientConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import type { SpriteSheetId } from '@/config/spriteConfig';
import { SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { SoundCue } from '@/core/audioTypes';
import type { DungeonFloor } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import { sound } from '@/audio/SoundBoard';
import type { AmbientSpot } from '@/dungeon/AmbientPlanner';
import type { PointLight } from '@/effects/LightingOverlay';
import { torchLightKey } from '@/effects/LightingOverlay';
import type { AmbientHero } from '@/effects/AmbientLifeView';
import { SHADOW_TEXTURE, threatFor } from '@/effects/AmbientLifeView';
import type { PixelBounds } from '@/systems/AmbientLife';
import type { CanState, ScuttlerState } from '@/systems/AmbientCritters';
import { ScuttlePhase, canSpeed, initialCan, initialScuttler, stepCan, stepScuttler } from '@/systems/AmbientCritters';

interface MutableLight extends PointLight {
  x: number;
  y: number;
  radius: number;
}

interface Scuttler {
  readonly sheet: SpriteSheetId;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly config: ScuttlerConfig;
  readonly bounds: PixelBounds;
  /** Żużlowy chrząszcz świeci (mała plamka żaru); karaluch — nie. */
  readonly light: MutableLight | null;
  readonly glow: Phaser.GameObjects.Image | null;
  state: ScuttlerState;
  /** Następne drgnięcie w spoczynku (obrót o kilka stopni — czysto wizualne). */
  nextTwitchAt: number;
}

interface Can {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  state: CanState;
}

/** Siła poświaty chrząszcza (ADD) i jej barwa — żar z pancerza. */
const BEETLE_GLOW_ALPHA = 0.12;
const BEETLE_GLOW_TINT = 0xd95f19;

/**
 * Biegające drobiazgi i puszki (krok 157): żużlowe chrząszcze w Piekle, karaluchy i puszki w mieszkaniu gracza.
 * Zachowanie liczą czyste funkcje `systems/AmbientCritters`, tu tylko rysunek, obrót i dźwięk. Liczy tylko to, co
 * blisko kadru. Math.random — wyłącznie dla wyglądu (rozrzut kierunku, drgnięcia).
 */
export class AmbientCritterView {
  private readonly scuttlers: Scuttler[] = [];
  private readonly cans: Can[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly floor: DungeonFloor,
    spots: readonly AmbientSpot[],
    private readonly config: BiomeAmbientConfig,
    private readonly glowEnabled: boolean,
  ) {
    for (const spot of spots) {
      const room = floor.rooms[spot.roomId];
      if (!room) continue;
      const x = spot.tile.x * TILE_SIZE + TILE_SIZE / 2;
      const y = spot.tile.y * TILE_SIZE + TILE_SIZE / 2;
      const bounds: PixelBounds = {
        left: room.x * TILE_SIZE,
        top: room.y * TILE_SIZE,
        right: (room.x + room.width) * TILE_SIZE,
        bottom: (room.y + room.height) * TILE_SIZE,
      };
      if (spot.kind === AmbientKind.CinderBeetle && config.infernal) {
        this.scuttlers.push(this.createScuttler('hellBeetle', x, y, bounds, config.infernal.beetles.scuttle, config.infernal.beetles.lightRadius));
      } else if (spot.kind === AmbientKind.Roach && config.den) {
        this.scuttlers.push(this.createScuttler('denRoach', x + Phaser.Math.Between(-6, 6), y + Phaser.Math.Between(-5, 5), bounds, config.den.roaches.scuttle, 0));
      } else if (spot.kind === AmbientKind.Can && config.den) {
        this.cans.push(this.createCan(x + Phaser.Math.Between(-4, 4), y + Phaser.Math.Between(-4, 4)));
      }
    }
  }

  /** Światła chrząszczy (żar spod pancerza). */
  get lights(): PointLight[] {
    const lights: PointLight[] = [];
    for (const s of this.scuttlers) if (s.light && s.state.phase !== ScuttlePhase.Hidden) lights.push(s.light);
    return lights;
  }

  private createScuttler(sheet: SpriteSheetId, x: number, y: number, bounds: PixelBounds, config: ScuttlerConfig, lightRadius: number): Scuttler {
    const angle = Math.random() * Math.PI * 2;
    const sprite = this.scene.add.sprite(x, y, SPRITE_SHEETS[sheet].key).setDepth(RENDER_DEPTH.ambientCritter).setRotation(angle);
    sprite.play({ key: animationKey(sheet, 'idle'), startFrame: Phaser.Math.Between(0, 1) });
    const light: MutableLight | null = lightRadius > 0 ? { x, y, radius: lightRadius } : null;
    const glow = light
      ? this.scene.add
          .image(x, y, torchLightKey(this.scene, lightRadius))
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(BEETLE_GLOW_TINT)
          .setAlpha(BEETLE_GLOW_ALPHA)
          .setDepth(RENDER_DEPTH.torchGlow)
          .setVisible(this.glowEnabled)
      : null;
    return { sheet, sprite, config, bounds, light, glow, state: initialScuttler(x, y, Math.cos(angle), Math.sin(angle)), nextTwitchAt: Phaser.Math.Between(400, 3000) };
  }

  private createCan(x: number, y: number): Can {
    const shadow = this.scene.add.image(x, y + 3, SHADOW_TEXTURE).setDepth(RENDER_DEPTH.actorShadow).setScale(0.7);
    const sprite = this.scene.add.sprite(x, y, SPRITE_SHEETS.denCan.key, 0).setDepth(RENDER_DEPTH.ambientCritter);
    sprite.setRotation(Math.random() * Math.PI);
    return { sprite, shadow, state: initialCan(x, y) };
  }

  update(time: number, dt: number, heroes: readonly AmbientHero[], near: (x: number, y: number) => boolean): void {
    for (const s of this.scuttlers) {
      if (s.state.phase === ScuttlePhase.Hidden || !near(s.state.x, s.state.y)) continue;
      this.updateScuttler(s, time, dt, heroes);
    }
    for (const can of this.cans) {
      if (!near(can.state.x, can.state.y)) continue;
      this.updateCan(can, dt, heroes);
    }
  }

  private updateScuttler(s: Scuttler, time: number, dt: number, heroes: readonly AmbientHero[]): void {
    const before = s.state.phase;
    const step = stepScuttler(s.state, time, dt, threatFor(heroes, s.state.x, s.state.y), s.bounds, s.config, (Math.random() - 0.5) * 2 * s.config.spread);
    s.state = step.state;
    if (step.event === 'scatter') {
      s.sprite.play(animationKey(s.sheet, 'run'));
      if (s.sheet === 'denRoach') sound.play(SoundCue.RoachScatter, s.sprite);
    }
    if (s.state.phase === ScuttlePhase.Hidden) {
      // Karaluch wbiegł w szparę pod murem — znika (krótkie zanikanie).
      this.scene.tweens.add({ targets: s.sprite, alpha: 0, duration: 120, onComplete: () => s.sprite.destroy() });
      s.glow?.destroy();
      return;
    }
    if (before === ScuttlePhase.Run && s.state.phase === ScuttlePhase.Idle) s.sprite.play(animationKey(s.sheet, 'idle'));
    if (s.state.phase === ScuttlePhase.Run) s.sprite.setRotation(Math.atan2(s.state.dirY, s.state.dirX));
    else if (time >= s.nextTwitchAt) {
      s.nextTwitchAt = time + Phaser.Math.Between(900, 3200);
      s.sprite.setRotation(s.sprite.rotation + (Math.random() - 0.5) * 0.9);
    }
    s.sprite.setPosition(Math.round(s.state.x), Math.round(s.state.y));
    if (s.light && s.glow) {
      s.light.x = s.state.x;
      s.light.y = s.state.y;
      s.glow.setPosition(Math.round(s.state.x), Math.round(s.state.y));
    }
  }

  private updateCan(can: Can, dt: number, heroes: readonly AmbientHero[]): void {
    const config = this.config.den!.cans;
    const moving = canSpeed(can.state) > 0;
    const threat = threatFor(heroes, can.state.x, can.state.y);
    if (!moving && (!threat || threat.distance > config.kickRadius * 2) && !can.state.inside) return;
    const step = stepCan(can.state, dt, threat, (x, y) => this.solid(x, y), config);
    can.state = step.state;
    if (step.event === 'kick') {
      sound.play(SoundCue.CanKick, can.sprite);
      can.sprite.setRotation(Math.atan2(can.state.vy, can.state.vx) + Math.PI / 2);
    }
    if (step.event === 'clink') sound.play(SoundCue.CanKick, can.sprite);
    if (canSpeed(can.state) > 0) can.sprite.setRotation(Math.atan2(can.state.vy, can.state.vx) + Math.PI / 2);
    // Klatka toczenia z przebytej drogi: obwód puszki ok. 8 px na 4 klatki.
    can.sprite.setFrame(Math.floor(can.state.rolled / 2) % 4);
    can.sprite.setPosition(Math.round(can.state.x), Math.round(can.state.y));
    can.shadow.setPosition(Math.round(can.state.x), Math.round(can.state.y + 3));
  }

  /** Ściana (albo zamknięte schody) pod punktem świata — puszka się od niej odbija. */
  private solid(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.floor.width || ty >= this.floor.height) return true;
    return this.floor.tiles[ty * this.floor.width + tx] !== TileType.Floor;
  }
}
