import Phaser from 'phaser';
import { SOUNDSCAPE_ECHO, SoundscapeEcho } from '@/config/soundscapeConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import type { SoundscapePick } from '@/systems/Soundscape';

const GRAIN_TEXTURE = 'tex-soundscape-grain';

/**
 * Obraz do odgłosów biomu (krok 159): dudnienie Piekła lekko trzęsie kadrem i sypie pyłem z sufitu, osypujący się
 * gruz ruin sypie strużką kurzu od strony dźwięku, a krakanie na Cmentarzysku to kruk przelatujący nad kadrem.
 * Czysto wizualne (Math.random), liczby w `SOUNDSCAPE_ECHO`.
 */
export class SoundscapeEchoes {
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly ash: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private readonly scene: Phaser.Scene) {
    if (!scene.textures.exists(GRAIN_TEXTURE)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
      g.generateTexture(GRAIN_TEXTURE, 1, 1);
      g.destroy();
    }
    const c = SOUNDSCAPE_ECHO;
    const emitter = (tints: readonly number[]) =>
      scene.add
        .particles(0, 0, GRAIN_TEXTURE, {
          lifespan: { min: c.lifespanMs.min, max: c.lifespanMs.max },
          speedX: { min: -4, max: 4 },
          speedY: { min: c.fallSpeed.min, max: c.fallSpeed.max },
          alpha: { start: 1, end: 0.2 },
          scale: { min: 1, max: 2 },
          tint: [...tints],
          emitting: false,
        })
        .setDepth(RENDER_DEPTH.motes);
    this.dust = emitter(c.dustTints);
    this.ash = emitter(c.quakeTints);
  }

  /** Odgłos zagrał w punkcie świata (x, y) — pokaż jego obraz, jeśli ma. */
  play(pick: SoundscapePick, x: number, y: number): void {
    const view = this.scene.cameras.main.worldView;
    switch (pick.echo) {
      case SoundscapeEcho.Quake: {
        const camera = this.scene.cameras.main;
        if (!camera.shakeEffect.isRunning) camera.shake(SOUNDSCAPE_ECHO.quakeShakeMs, SOUNDSCAPE_ECHO.quakeIntensity);
        for (let i = 0; i < SOUNDSCAPE_ECHO.quakePlumes; i++) this.plume(this.ash, view.x + Math.random() * view.width, view.y + Math.random() * view.height * 0.7);
        break;
      }
      case SoundscapeEcho.Dust: {
        // Strużki po stronie dźwięku: punkt źródła przyciągnięty do kadru (z marginesem).
        const px = Phaser.Math.Clamp(x, view.x + 70, view.right - 70);
        const py = Phaser.Math.Clamp(y, view.y + 40, view.bottom - 70);
        for (let i = 0; i < SOUNDSCAPE_ECHO.dustPlumes; i++) this.plume(this.dust, px + Phaser.Math.Between(-30, 30), py + Phaser.Math.Between(-20, 20));
        break;
      }
      case SoundscapeEcho.Flyover:
        this.flyover(x < view.centerX, view);
        break;
      default:
        break;
    }
  }

  /** Strużka ziarenek sypiących się z sufitu (wąski pas, kilka klatek po sobie). */
  private plume(emitter: Phaser.GameObjects.Particles.ParticleEmitter, x: number, y: number): void {
    const n = SOUNDSCAPE_ECHO.grainsPerPlume;
    for (let i = 0; i < n; i++) {
      this.scene.time.delayedCall(i * 35, () => emitter.emitParticleAt(Math.round(x + Phaser.Math.Between(-3, 3)), Math.round(y + Phaser.Math.Between(-2, 2)), 1));
    }
  }

  /** Kruk przelatuje przez górną część kadru od strony, z której zakrakał. */
  private flyover(fromLeft: boolean, view: Phaser.Geom.Rectangle): void {
    const band = SOUNDSCAPE_ECHO.flyoverBand;
    const y = view.y + view.height * (band.min + Math.random() * (band.max - band.min));
    const startX = fromLeft ? view.x - 16 : view.right + 16;
    const endX = fromLeft ? view.right + 16 : view.x - 16;
    const raven = this.scene.add
      .sprite(startX, y, SPRITE_SHEETS.graveRaven.key)
      .setDepth(RENDER_DEPTH.ambientFlyer)
      .setFlipX(!fromLeft)
      .setAlpha(0.9);
    raven.play(animationKey('graveRaven', 'fly'));
    this.scene.tweens.add({
      targets: raven,
      x: endX,
      y: y - Phaser.Math.Between(10, 30),
      duration: SOUNDSCAPE_ECHO.flyoverMs,
      ease: 'Sine.easeIn',
      onComplete: () => raven.destroy(),
    });
  }
}
