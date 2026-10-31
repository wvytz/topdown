import Phaser from 'phaser';
import { SoundCue, sound } from '@/audio/SoundBoard';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { SLUDGE_FX } from '@/config/sludgeConfig';
import type { SludgeQuality } from '@/config/sludgeConfig';
import { SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import type { SpriteSheetId } from '@/config/spriteConfig';
import { currentPlatform } from '@/core/platform';
import { FireBudget, RateGate, particleCount, shakeIntensity } from '@/systems/FireBurst';
import { splashSpriteFor } from '@/systems/Sludge';

const DROPLET_TEXTURE = 'fx-sludge-droplet';
const SPLASH_SHEETS: Readonly<Record<number, SpriteSheetId>> = { 32: 'sludgeSplash32', 64: 'sludgeSplash64', 96: 'sludgeSplash96', 112: 'sludgeSplash112' };

/** Głębokości: rozbryzg leży na podłodze (pod łupami i postaciami), krople lecą nad wrogami, bąble na kałużach. */
const SPLASH_DEPTH = RENDER_DEPTH.fireGround - 0.1;
const BUBBLE_DEPTH = RENDER_DEPTH.floorHazard + 0.05;

/**
 * Szlam walki (krok 153, `#krol-szlamu`): rozbryzg z generatora (`tools/sludge_sprites.py`) w zasięgu strefy,
 * krople szlamu opadające z grawitacją, bąble pękające na kałużach i na szlamie przy ścianach, mlaśnięcie
 * i lekki wstrząs. Odpowiednik `FireEffects`, z pulą i limitem zależnym od wersji. Czysto wizualne: Math.random wolno.
 */
export class SludgeEffects {
  private readonly quality: SludgeQuality = SLUDGE_FX.quality[currentPlatform()];
  private readonly splashes: FireBudget;
  private readonly bubbles: FireBudget;
  private readonly freeSplashes: Phaser.GameObjects.Sprite[] = [];
  private readonly freeBubbles: Phaser.GameObjects.Sprite[] = [];
  private readonly droplets: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly splat = new RateGate(SLUDGE_FX.soundGapMs);

  constructor(private readonly scene: Phaser.Scene) {
    this.splashes = new FireBudget(this.quality.maxSplashes);
    this.bubbles = new FireBudget(this.quality.maxBubbles);
    this.ensureTextures();
    const { droplets } = SLUDGE_FX;
    this.droplets = scene.add.particles(0, 0, DROPLET_TEXTURE, {
      lifespan: { min: droplets.lifespanMs.min, max: droplets.lifespanMs.max },
      speed: { min: droplets.speed.min, max: droplets.speed.max },
      angle: { min: 200, max: 340 },
      gravityY: droplets.gravityY,
      tint: [SLUDGE_FX.purple[2], SLUDGE_FX.purple[3], SLUDGE_FX.purple[1], SLUDGE_FX.brown[2]],
      alpha: { start: 1, end: 0.6 },
      maxAliveParticles: Math.round(droplets.max * 4 * this.quality.particleScale),
      emitting: false,
    });
    this.droplets.setDepth(RENDER_DEPTH.fireBurst);
  }

  /** Statystyki puli (weryfikacja w przeglądarce). */
  get stats(): { readonly splashes: number; readonly bubbles: number } {
    return { splashes: this.splashes.active, bubbles: this.bubbles.active };
  }

  /** Rozbryzg szlamu w strefie `radius` (rysunek nie wychodzi poza strefę), krople, mlaśnięcie, wstrząs. */
  splash(x: number, y: number, radius: number, options: { readonly shake?: boolean; readonly sound?: boolean } = {}): void {
    const now = this.scene.time.now;
    if (options.sound !== false && this.splat.pass(now)) sound.play(SoundCue.SludgeSplat, { x, y });
    if (this.splashes.take(1) === 1) this.playSplash(x, y, radius);
    const { droplets, shake } = SLUDGE_FX;
    this.droplets.explode(particleCount(radius, droplets.perRadius, droplets.max, this.quality.particleScale), x, y);
    if (options.shake !== false) {
      const camera = this.scene.cameras.main;
      if (!camera.shakeEffect.isRunning) camera.shake(shake.durationMs, shakeIntensity(radius, shake));
    }
  }

  /** Bąbel pękający w punkcie (kałuża, szlam przy ścianie). Pomija, gdy pula pełna. */
  bubble(x: number, y: number): void {
    if (this.bubbles.take(1) !== 1) return;
    const sprite =
      this.freeBubbles.pop() ?? this.scene.add.sprite(0, 0, SPRITE_SHEETS.sludgeBubble.key).setDepth(BUBBLE_DEPTH);
    sprite.setVisible(true).setActive(true).setPosition(Math.round(x), Math.round(y)).play(animationKey('sludgeBubble', 'pop'));
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      sprite.setVisible(false).setActive(false);
      this.freeBubbles.push(sprite);
      this.bubbles.release();
    });
  }

  private playSplash(x: number, y: number, radius: number): void {
    const { size, scale } = splashSpriteFor(radius, SLUDGE_FX.splashSizes, SLUDGE_FX.splashSlackPx);
    const sheet = SPLASH_SHEETS[size] ?? 'sludgeSplash32';
    const sprite = this.freeSplashes.pop() ?? this.scene.add.sprite(0, 0, '__DEFAULT').setDepth(SPLASH_DEPTH);
    sprite
      .setVisible(true)
      .setActive(true)
      .setPosition(Math.round(x), Math.round(y))
      .setScale(scale)
      .setFlipX(Math.random() < 0.5)
      .play(animationKey(sheet, 'burst'));
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      sprite.setVisible(false).setActive(false);
      this.freeSplashes.push(sprite);
      this.splashes.release();
    });
  }

  private ensureTextures(): void {
    if (this.scene.textures.exists(DROPLET_TEXTURE)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    // Kropla 3×3 bez rogów — przy tincie wygląda jak kluska szlamu.
    g.fillStyle(0xffffff, 1).fillRect(1, 0, 1, 3).fillRect(0, 1, 3, 1);
    g.generateTexture(DROPLET_TEXTURE, 3, 3);
    g.destroy();
  }
}
