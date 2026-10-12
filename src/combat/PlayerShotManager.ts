import Phaser from 'phaser';
import type { RangedConfig } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { TextureKey } from '@/core/types';
import { Projectile } from '@/entities/Projectile';
import { normalize } from '@/systems/CombatMath';
import type { PlayerShot } from '@/systems/ShotResolver';

/** Rozstrzyga trafienie pocisku gracza; true = pocisk trafił i znika. */
export type PlayerShotResolver = (shot: PlayerShot) => boolean;

/** Pociski gracza: lot, rozbijanie o ściany i kraty, wygasanie, trafienia przez przekazany resolver. */
export class PlayerShotManager {
  private readonly group: Phaser.Physics.Arcade.Group;

  constructor(
    private readonly scene: Phaser.Scene,
    walls: Phaser.Tilemaps.TilemapLayer,
  ) {
    this.group = scene.physics.add.group({ classType: Projectile });
    scene.physics.add.collider(this.group, walls, (shot) => {
      if (shot instanceof Projectile) shot.destroy();
    });
  }

  fire(origin: Vector2, direction: Vector2, config: RangedConfig): void {
    const shot = new Projectile(this.scene, origin.x, origin.y, TextureKey.PlayerShot);
    shot.damage = config.damage;
    shot.knockback = config.knockback;
    shot.expiresAt = this.scene.time.now + config.projectileLifetimeMs;
    shot.setDepth(11);

    this.group.add(shot, true);
    shot.setCircle(config.projectileRadius);
    const dir = normalize(direction);
    shot.setVelocity(dir.x * config.projectileSpeed, dir.y * config.projectileSpeed);
  }

  update(now: number, resolve: PlayerShotResolver): void {
    for (const child of [...this.group.getChildren()]) {
      if (!(child instanceof Projectile)) continue;
      if (now >= child.expiresAt) {
        child.destroy();
        continue;
      }
      const velocity = child.body?.velocity ?? { x: 0, y: 0 };
      const shot: PlayerShot = {
        position: { x: child.x, y: child.y },
        velocity: { x: velocity.x, y: velocity.y },
        radius: child.displayWidth / 2,
        origin: child.origin,
        damage: child.damage,
        knockback: child.knockback,
        now,
      };
      if (resolve(shot)) child.destroy();
    }
  }
}
