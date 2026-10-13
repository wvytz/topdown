import Phaser from 'phaser';
import type { RangedConfig, WeaponEffects } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { TextureKey } from '@/core/types';
import { Projectile } from '@/entities/Projectile';
import { normalize } from '@/systems/CombatMath';
import type { PlayerShot } from '@/systems/ShotResolver';
import { RENDER_DEPTH } from '@/config/renderLayers';

/** Rozstrzyga trafienie pocisku gracza; zwraca trafiony cel albo null. */
export type PlayerShotResolver = (shot: PlayerShot) => object | null;

/**
 * Pociski gracza: lot, rozbijanie o ściany i kraty, wygasanie, przebijanie wrogów (Szuriken).
 * Trafienia rozstrzyga resolver przekazany przez scenę.
 */
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

  fire(origin: Vector2, direction: Vector2, config: RangedConfig, effects: WeaponEffects): void {
    const shot = new Projectile(this.scene, origin.x, origin.y, TextureKey.PlayerShot);
    shot.damage = config.damage;
    shot.knockback = config.knockback;
    shot.expiresAt = this.scene.time.now + config.projectileLifetimeMs;
    shot.status = effects.shotStatus;
    shot.pierceLeft = effects.shotPierce;
    shot.setDepth(RENDER_DEPTH.projectile);

    this.group.add(shot, true);
    shot.setCircle(config.projectileRadius);
    const dir = normalize(direction);
    shot.setVelocity(dir.x * config.projectileSpeed, dir.y * config.projectileSpeed);
    // Przebijający pocisk obraca się jak szuriken (czysto wizualnie).
    if (shot.pierceLeft > 0) shot.setAngularVelocity(720);
  }

  update(now: number, resolve: PlayerShotResolver): void {
    for (const child of [...this.group.getChildren()]) {
      if (!(child instanceof Projectile)) continue;
      if (now >= child.expiresAt) {
        child.destroy();
        continue;
      }
      const velocity = child.body?.velocity ?? { x: 0, y: 0 };
      const target = resolve({
        position: { x: child.x, y: child.y },
        velocity: { x: velocity.x, y: velocity.y },
        radius: child.displayWidth / 2,
        origin: child.origin,
        damage: child.damage,
        knockback: child.knockback,
        now,
        status: child.status,
        ignore: child.hitTargets,
      });
      if (!target) continue;
      child.hitTargets.add(target);
      if (child.pierceLeft > 0) child.pierceLeft--;
      else child.destroy();
    }
  }
}
