import Phaser from 'phaser';
import { SoundCue, sound } from '@/audio/SoundBoard';
import { FIRE_FX } from '@/config/fireConfig';
import type { FireQuality } from '@/config/fireConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { animationKey } from '@/config/spriteConfig';
import type { SpriteSheetId } from '@/config/spriteConfig';
import { currentPlatform } from '@/core/platform';
import type { PointLight } from '@/effects/LightingOverlay';
import { torchLightKey } from '@/effects/LightingOverlay';
import {
  FireBudget,
  RateGate,
  burstSpriteFor,
  fireLightPeak,
  fireLightRadius,
  flameCount,
  flameSpots,
  particleCount,
  shakeIntensity,
} from '@/systems/FireBurst';

const EMBER_TEXTURE = 'fx-fire-ember';
const SMOKE_TEXTURE = 'fx-fire-smoke';
/** Poświata: biały stempel światła pochodni (miękki brzeg) o tym promieniu, skalowany i barwiony. */
const GLOW_BASE_RADIUS = 32;

const BURST_SHEETS: Readonly<Record<number, SpriteSheetId>> = { 32: 'fireBurst32', 64: 'fireBurst64' };

/** Opcje jednego wybuchu ognia. */
export interface FireBurstOptions {
  /** Płomienie zostają na podłodze (domyślnie tak). */
  readonly flames?: boolean;
  /** Wstrząs kamery (domyślnie tak). */
  readonly shake?: boolean;
  /** Huk wybuchu (domyślnie tak; i tak najwyżej co `soundGapMs`). */
  readonly sound?: boolean;
}

interface FireLight {
  readonly x: number;
  readonly y: number;
  readonly peak: number;
  readonly bornAt: number;
}

/** Płomienie i poświata jednej płonącej plamy (krok 114), trzymane tak długo, jak plama. */
interface PatchFire {
  readonly flames: Phaser.GameObjects.Sprite[];
  readonly glow: Phaser.GameObjects.Image;
  dying: boolean;
}

/**
 * Ogień walki (krok 144): kula ognia z generatora (`tools/fire_sprites.py`), płomienie zostające na podłodze,
 * iskry i dym (cząsteczki), poświata ADD i światło wycierające mrok, wstrząs kamery. Wszystko z puli o limicie
 * zależnym od wersji (telefon — mniej). Czysto wizualne: Math.random dozwolony.
 */
export class FireEffects {
  private readonly quality: FireQuality = FIRE_FX.quality[currentPlatform()];
  private readonly bursts: FireBudget;
  private readonly flames: FireBudget;
  private readonly freeBursts: Phaser.GameObjects.Sprite[] = [];
  private readonly freeFlames: Phaser.GameObjects.Sprite[] = [];
  private readonly freeGlows: Phaser.GameObjects.Image[] = [];
  private readonly embers: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly boom = new RateGate(FIRE_FX.soundGapMs);
  private lights: FireLight[] = [];
  /** Światła płonących plam z ostatniego `syncPatches`. */
  private patchLights: PointLight[] = [];
  private readonly patches = new Map<object, PatchFire>();
  /** Czy w punkcie jest podłoga — płomienie nie stają na murach (ustawia scena po zbudowaniu piętra). */
  private floorAt: (x: number, y: number) => boolean = () => true;

  constructor(private readonly scene: Phaser.Scene) {
    this.bursts = new FireBudget(this.quality.maxBursts);
    this.flames = new FireBudget(this.quality.maxFlames);
    this.ensureTextures();
    const { embers, smoke } = FIRE_FX;
    const half = Math.floor(this.quality.maxParticles / 2);
    this.embers = scene.add.particles(0, 0, EMBER_TEXTURE, {
      lifespan: { min: embers.lifespanMs.min, max: embers.lifespanMs.max },
      speed: { min: embers.speed.min, max: embers.speed.max },
      angle: { min: 200, max: 340 },
      gravityY: embers.gravityY,
      alpha: { start: 1, end: 0 },
      tint: [...embers.colors],
      blendMode: Phaser.BlendModes.ADD,
      maxAliveParticles: half,
      emitting: false,
    });
    this.embers.setDepth(RENDER_DEPTH.fireEmbers);
    this.smoke = scene.add.particles(0, 0, SMOKE_TEXTURE, {
      lifespan: { min: smoke.lifespanMs.min, max: smoke.lifespanMs.max },
      speedY: { min: -smoke.rise.max, max: -smoke.rise.min },
      speedX: { min: -8, max: 8 },
      scale: { start: 1, end: 2 },
      alpha: { start: smoke.alpha, end: 0 },
      tint: [...smoke.colors],
      maxAliveParticles: this.quality.maxParticles - half,
      emitting: false,
    });
    this.smoke.setDepth(RENDER_DEPTH.fireBurst);
  }

  setFloorCheck(floorAt: (x: number, y: number) => boolean): void {
    this.floorAt = floorAt;
  }

  /** Statystyki puli (weryfikacja w przeglądarce: `__game` → scena → efekty). */
  get stats(): { readonly bursts: number; readonly flames: number; readonly lights: number; readonly patches: number } {
    return { bursts: this.bursts.active, flames: this.flames.active, lights: this.lights.length, patches: this.patches.size };
  }

  /** Wybuch ognia w strefie o promieniu `radius` (zasięg obrażeń pokazuje osobno pierścień `CombatEffects.blast`). */
  burst(x: number, y: number, radius: number, options: FireBurstOptions = {}): void {
    const now = this.scene.time.now;
    if (options.sound !== false && this.boom.pass(now)) sound.play(SoundCue.Explosion, { x, y });
    if (this.bursts.take(1) === 1) this.playBall(x, y, radius);
    this.flashGlow(x, y, radius);
    this.addLight(x, y, radius, now);
    const scale = this.quality.particleScale;
    this.embers.explode(particleCount(radius, FIRE_FX.embers.perRadius, FIRE_FX.embers.max, scale), x, y);
    this.smoke.explode(particleCount(radius, FIRE_FX.smoke.perRadius, FIRE_FX.smoke.max, scale), x, y - radius * 0.3);
    if (options.flames !== false) this.spawnFlames(x, y, radius);
    if (options.shake !== false) {
      const camera = this.scene.cameras.main;
      if (!camera.shakeEffect.isRunning) camera.shake(FIRE_FX.shake.durationMs, shakeIntensity(radius, FIRE_FX.shake));
    }
  }

  /** Światła ognia na tę klatkę (do wycierania mroku); zgasłe wypadają, najwyżej `maxLights` najnowszych. */
  activeLights(): PointLight[] {
    const now = this.scene.time.now;
    const { durationMs, step } = FIRE_FX.light;
    this.lights = this.lights.filter((l) => now - l.bornAt < durationMs);
    const out: PointLight[] = [];
    for (let i = this.lights.length - 1; i >= 0 && out.length < this.quality.maxLights; i--) {
      const light = this.lights[i]!;
      const radius = fireLightRadius(light.peak, now - light.bornAt, durationMs, step);
      if (radius > 0) out.push({ x: light.x, y: light.y, radius });
    }
    for (const patch of this.patchLights) if (out.length < this.quality.maxLights) out.push(patch);
    return out;
  }

  /**
   * Płonące plamy (krok 114): płomienie stojące w plamie, poświata nad mrokiem i światło. `stage` z
   * `firePatchStage` — przy dogasaniu płomienie gasną. Wołane co klatkę z pełną listą plam.
   */
  syncPatches(patches: Iterable<{ readonly key: object; readonly x: number; readonly y: number; readonly r: number; readonly dying: boolean }>, frame: number): void {
    const v = FIRE_FX.patch;
    const seen = new Set<object>();
    const lights: PointLight[] = [];
    for (const p of patches) {
      seen.add(p.key);
      let fire = this.patches.get(p.key);
      if (!fire) {
        const want = Math.min(v.maxFlames, Math.max(1, Math.round(p.r * v.flamesPerRadius)));
        const granted = this.flames.take(want);
        const spots = flameSpots({ x: p.x, y: p.y }, p.r, granted, v.spread, Math.random);
        const flames = spots.map((spot) => {
          const flame = this.takeFlame(spot.x, spot.y);
          flame.play(animationKey('fireFlame', 'ignite')).chain(animationKey('fireFlame', 'burn'));
          return flame;
        });
        const glow = this.takeGlow(p.x, p.y, p.r * v.glowScale, v.glowAlpha);
        fire = { flames, glow, dying: false };
        this.patches.set(p.key, fire);
      }
      if (p.dying && !fire.dying) {
        fire.dying = true;
        for (const flame of fire.flames) flame.play(animationKey('fireFlame', 'die'));
      }
      // Migotanie poświaty skokowo z klatką ognia.
      const flicker = 1 - v.flicker + v.flicker * (((frame * 7 + Math.round(p.x)) % 5) / 4);
      fire.glow.setAlpha(v.glowAlpha * flicker * (p.dying ? 0.5 : 1));
      if (!p.dying) lights.push({ x: p.x, y: p.y, radius: Math.round((p.r * v.lightScale) / FIRE_FX.light.step) * FIRE_FX.light.step || FIRE_FX.light.step });
    }
    for (const [key, fire] of this.patches) {
      if (seen.has(key)) continue;
      for (const flame of fire.flames) this.releaseFlame(flame);
      this.releaseGlow(fire.glow);
      this.patches.delete(key);
    }
    this.patchLights = lights;
  }

  private playBall(x: number, y: number, radius: number): void {
    const { size, scale } = burstSpriteFor(radius, FIRE_FX.burstSizes, FIRE_FX.burstCover);
    const sheet = BURST_SHEETS[size] ?? 'fireBurst32';
    const ball = this.freeBursts.pop() ?? this.scene.add.sprite(0, 0, '__DEFAULT').setDepth(RENDER_DEPTH.fireBurst);
    ball
      .setVisible(true)
      .setActive(true)
      .setPosition(Math.round(x), Math.round(y))
      .setScale(scale)
      .setFlipX(Math.random() < 0.5)
      .play(animationKey(sheet, 'burst'));
    ball.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      ball.setVisible(false).setActive(false);
      this.freeBursts.push(ball);
      this.bursts.release();
    });
  }

  private flashGlow(x: number, y: number, radius: number): void {
    const { glow } = FIRE_FX;
    const r = Math.max(glow.minRadius, radius * glow.radiusScale);
    const image = this.takeGlow(x, y, r, glow.alpha);
    this.scene.tweens.add({
      targets: image,
      alpha: 0,
      scale: image.scale * 1.25,
      duration: glow.durationMs,
      ease: 'Quad.easeIn',
      onComplete: () => this.releaseGlow(image),
    });
  }

  private addLight(x: number, y: number, radius: number, now: number): void {
    this.lights.push({ x, y, peak: fireLightPeak(radius, FIRE_FX.light), bornAt: now });
    // Starsze ponad zapas i tak by nie weszły do kadru świateł — nie trzymamy ich.
    if (this.lights.length > this.quality.maxLights * 2) this.lights.splice(0, this.lights.length - this.quality.maxLights * 2);
  }

  private spawnFlames(x: number, y: number, radius: number): void {
    const { flames: cfg } = FIRE_FX;
    const spots = flameSpots({ x, y }, radius, flameCount(radius, cfg), cfg.spread, Math.random).filter((s) => this.floorAt(s.x, s.y));
    const granted = this.flames.take(spots.length);
    for (const spot of spots.slice(0, granted)) {
      const flame = this.takeFlame(spot.x, spot.y).setVisible(false);
      const linger = cfg.lingerMs.min + Math.random() * (cfg.lingerMs.max - cfg.lingerMs.min);
      this.scene.time.delayedCall(Math.random() * cfg.igniteDelayMs, () => {
        flame.setVisible(true).play(animationKey('fireFlame', 'ignite')).chain(animationKey('fireFlame', 'burn'));
        this.scene.time.delayedCall(linger, () => {
          flame.play(animationKey('fireFlame', 'die'));
          flame.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.releaseFlame(flame));
        });
      });
    }
  }

  /** Płomień z puli: stopa (wiersz 21 z 24) w punkcie podłogi. */
  private takeFlame(x: number, y: number): Phaser.GameObjects.Sprite {
    const flame = this.freeFlames.pop() ?? this.scene.add.sprite(0, 0, '__DEFAULT').setOrigin(0.5, 22 / 24).setDepth(RENDER_DEPTH.fireGround);
    flame.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    return flame.setVisible(true).setActive(true).setPosition(Math.round(x), Math.round(y)).setFlipX(Math.random() < 0.5);
  }

  private releaseFlame(flame: Phaser.GameObjects.Sprite): void {
    flame.stop().setVisible(false).setActive(false);
    this.freeFlames.push(flame);
    this.flames.release();
  }

  private takeGlow(x: number, y: number, radius: number, alpha: number): Phaser.GameObjects.Image {
    const key = torchLightKey(this.scene, GLOW_BASE_RADIUS);
    const image =
      this.freeGlows.pop() ??
      this.scene.add.image(0, 0, key).setBlendMode(Phaser.BlendModes.ADD).setTint(FIRE_FX.glow.color).setDepth(RENDER_DEPTH.fireGlow);
    return image.setVisible(true).setPosition(Math.round(x), Math.round(y)).setScale(radius / GLOW_BASE_RADIUS).setAlpha(alpha);
  }

  private releaseGlow(image: Phaser.GameObjects.Image): void {
    this.scene.tweens.killTweensOf(image);
    image.setVisible(false);
    this.freeGlows.push(image);
  }

  private ensureTextures(): void {
    const textures = this.scene.textures;
    if (!textures.exists(EMBER_TEXTURE)) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
      g.generateTexture(EMBER_TEXTURE, 2, 2);
      g.clear().fillStyle(0xffffff, 1).fillRect(1, 0, 2, 4).fillRect(0, 1, 4, 2);
      g.generateTexture(SMOKE_TEXTURE, 4, 4);
      g.destroy();
    }
  }
}
