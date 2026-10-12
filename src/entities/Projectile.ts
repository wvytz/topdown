import Phaser from 'phaser';
import { TextureKey } from '@/core/types';

/** Pocisk — dane trafienia przenosi ze sobą; ruch i kolizje obsługuje ProjectileManager. */
export class Projectile extends Phaser.Physics.Arcade.Image {
  damage = 0;
  knockback = 0;
  expiresAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TextureKey.Projectile);
  }
}
