import type Phaser from 'phaser';
import type { Vector2 } from '@/core/types';
import type { SpriteSheetId } from '@/config/spriteConfig';
import { animationKey } from '@/config/spriteConfig';
import { facingDirection } from '@/systems/Facing';

/**
 * Wybiera animację sprite'a z 8 kierunkami. Encja mówi tylko, *dokąd patrzy* i *co robi*.
 * Zmiana kierunku w trakcie tej samej animacji zachowuje klatkę (chód nie „przeskakuje” na początek).
 */
export class DirectionalAnimator {
  private direction = 4; // S — przodem do kamery
  private current = '';
  private currentName = '';

  constructor(
    private readonly sprite: Phaser.GameObjects.Sprite,
    private readonly sheet: SpriteSheetId,
  ) {}

  /** Kierunek patrzenia; wektor zerowy zachowuje poprzedni. */
  face(vector: Vector2): void {
    this.direction = facingDirection(vector) ?? this.direction;
  }

  /**
   * Gra animację `name` w bieżącym kierunku.
   * @param durationMs opcjonalnie: cała animacja ma trwać tyle (np. rzut zgrany z zamachem ataku)
   */
  play(name: string, durationMs?: number): void {
    const key = animationKey(this.sheet, name, this.direction);
    // Ta sama animacja w tym samym kierunku: nie restartujemy (także zakończonej jednorazowej, np. rzutu).
    if (key === this.current) return;

    const sameAnimation = name === this.currentName;
    const frameIndex = sameAnimation ? (this.sprite.anims.currentFrame?.index ?? 1) - 1 : 0;
    // Czas trwania przeliczamy na frameRate (Phaser przy startFrame bierze tempo z frameRate).
    const frames = this.sprite.scene.anims.get(key)?.frames.length ?? 1;
    this.sprite.play({
      key,
      startFrame: Math.max(0, frameIndex),
      ...(durationMs !== undefined && durationMs > 0 && { frameRate: (frames * 1000) / durationMs }),
    });
    this.current = key;
    this.currentName = name;
  }

  stop(): void {
    this.sprite.anims.stop();
  }
}
