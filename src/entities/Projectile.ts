import Phaser from 'phaser';
import { TextureKey } from '@/core/types';

/** Pocisk — dane trafienia przenosi ze sobą; ruch i kolizje obsługuje ProjectileManager. */
export class Projectile extends Phaser.Physics.Arcade.Image {
  damage = 0;
  knockback = 0;
  expiresAt = 0;

  /** Miejsce wystrzału (pociski gracza — trafiony wróg „słyszy” strzelca stamtąd). */
  origin = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, x: number, y: number, texture: TextureKey = TextureKey.Projectile) {
    super(scene, x, y, texture);
    this.origin = { x, y };
  }
}
