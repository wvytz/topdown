import Phaser from 'phaser';
import type { RangedConfig, StatusApplication, WeaponEffects } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { Projectile } from '@/entities/Projectile';
import { normalize } from '@/systems/CombatMath';
import type { PlayerShot } from '@/systems/ShotResolver';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { LOOT_ATLAS, lootAnimationKey } from '@/config/spriteConfig';

/** Parametry lotu i trafienia pocisku gracza (strzał barbarzyńcy, kula Czarodziejki, strzała łucznika). */
export type ShotSpec = Pick<RangedConfig, 'damage' | 'knockback' | 'projectileSpeed' | 'projectileLifetimeMs' | 'projectileRadius'>;

/** Wygląd pocisku z arkusza (kula Czarodziejki, strzała łucznika); brak = pocisk z atlasu łupów. */
export interface ShotLook {
  readonly texture: string;
  readonly animation: string;
  /** Statusy kuli: wszystkie efekty broni (strzał + cios), bo kule są jej bronią główną. */
  readonly status: StatusApplication;
  readonly vampiric: boolean;
  /** Magia (kula Czarodziejki) — trafia też bezcielesnych (krok 49b); także strzały łucznika (krok 82). */
  readonly magic: boolean;
  /** Przebicia ponad Szurikena (mocna strzała łuku). */
  readonly extraPierce?: number;
}

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

  fire(origin: Vector2, direction: Vector2, config: ShotSpec, effects: WeaponEffects, look?: ShotLook): void {
    const shot = new Projectile(this.scene, origin.x, origin.y, look?.texture ?? LOOT_ATLAS.key);
    shot.damage = config.damage;
    shot.knockback = config.knockback;
    shot.expiresAt = this.scene.time.now + config.projectileLifetimeMs;
    shot.status = look?.status ?? effects.shotStatus;
    shot.pierceLeft = effects.shotPierce + (look?.extraPierce ?? 0);
    shot.vampiric = look?.vampiric ?? false;
    shot.magic = look?.magic ?? false;
    shot.setDepth(RENDER_DEPTH.projectile);

    this.group.add(shot, true);
    // Ciało o promieniu z konfiguracji, wyśrodkowane w klatce 16×16 atlasu.
    const r = config.projectileRadius;
    shot.setCircle(r, shot.width / 2 - r, shot.height / 2 - r);
    const dir = normalize(direction);
    shot.setVelocity(dir.x * config.projectileSpeed, dir.y * config.projectileSpeed);
    // Przebijający pocisk to gwiazdka „szurikena” obracana klatkami co 45° (bez obrotu o dowolny kąt).
    if (look) shot.play(look.animation);
    else shot.play(lootAnimationKey(shot.pierceLeft > 0 ? 'shotPierce' : 'shot'));
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
        vampiric: child.vampiric,
        magic: child.magic,
      });
      if (!target) continue;
      child.hitTargets.add(target);
      if (child.pierceLeft > 0) child.pierceLeft--;
      else child.destroy();
    }
  }
}
