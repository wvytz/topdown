import Phaser from 'phaser';
import type { RangedConfig, StatusApplication, WeaponEffects } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { Projectile } from '@/entities/Projectile';
import { normalize } from '@/systems/CombatMath';
import { steerVelocity, type HomingConfig } from '@/systems/Homing';
import type { AimTarget } from '@/systems/touchAim';
import type { PlayerShot } from '@/systems/ShotResolver';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { LOOT_ATLAS, lootAnimationKey } from '@/config/spriteConfig';

/** Parametry lotu i trafienia pocisku gracza (strzał barbarzyńcy, kula Czarodziejki, strzała łucznika). */
export type ShotSpec = Pick<RangedConfig, 'damage' | 'knockback' | 'projectileSpeed' | 'projectileLifetimeMs' | 'projectileRadius'>;

/** Wygląd pocisku z arkusza (kula Czarodziejki, strzała łucznika); brak = pocisk z atlasu łupów. */
export interface ShotLook {
  readonly texture: string;
  /** Animacja z arkusza; brak = statyczna tekstura obrócona w kierunku lotu (fala ostrza, krok 150). */
  readonly animation?: string;
  /** Statusy kuli: wszystkie efekty broni (strzał + cios), bo kule są jej bronią główną. */
  readonly status: StatusApplication;
  readonly vampiric: boolean;
  /** Magia (kula Czarodziejki) — trafia też bezcielesnych (krok 49b); także strzały łucznika (krok 82). */
  readonly magic: boolean;
  /** Przebicia ponad Szurikena (mocna strzała łuku). */
  readonly extraPierce?: number;
}

/** Dodatkowe zachowanie lotu (krok 146). */
export interface ShotFlight {
  readonly homing?: HomingConfig;
  /** Krok 150, fala ostrza: przebija tylu wrogów niezależnie od Szurikena. */
  readonly pierce?: number;
}

/** Rozstrzyga trafienie pocisku gracza; zwraca trafiony cel albo null. `owner` — strzelec (co-op: który bohater). */
export type PlayerShotResolver = (shot: PlayerShot, owner: object | null) => object | null;

/**
 * Co pocisk robi po uderzeniu w kafel kolizji (zmienne warunki areny, krok 160): `reflect` — odbija się
 * (lustro), `absorb` — rozbija się, trafiając przeszkodę (żywopłot, gniazdo); null — zwykły mur.
 */
export type TileHitHook = (shot: Projectile, tile: { readonly x: number; readonly y: number }) => 'reflect' | 'absorb' | null;

/**
 * Pociski gracza: lot, rozbijanie o ściany i kraty, wygasanie, przebijanie wrogów (Szuriken).
 * Trafienia rozstrzyga resolver przekazany przez scenę.
 */
export class PlayerShotManager {
  private readonly group: Phaser.Physics.Arcade.Group;
  /** Strzelec każdego pocisku (co-op, etap C2): trafienie leczy i nietykalność bossa liczy się dla niego. */
  private readonly owners = new WeakMap<Projectile, object>();
  private tileHook: TileHitHook | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    walls: Phaser.Tilemaps.TilemapLayer,
  ) {
    this.group = scene.physics.add.group({ classType: Projectile });
    scene.physics.add.collider(this.group, walls, (shot, tile) => {
      if (!(shot instanceof Projectile)) return;
      // Lustro odbija (fizyka już odbiła pocisk — każdy ma sprężystość 1), przeszkoda areny przyjmuje trafienie.
      const verdict = tile instanceof Phaser.Tilemaps.Tile ? this.tileHook?.(shot, tile) : null;
      if (verdict === 'reflect') {
        const v = shot.body?.velocity;
        if (v && !shot.anims.isPlaying) shot.setRotation(Math.atan2(v.y, v.x));
        return;
      }
      if (verdict === 'absorb') {
        shot.destroy();
        return;
      }
      // Rykoszet (krok 150, Szuriken ×3): odbicie od muru zamiast rozbicia; lot trwa trochę dłużej.
      if (shot.bouncesLeft > 0) {
        shot.bouncesLeft--;
        shot.expiresAt += shot.bounceLifetimeMs;
        return;
      }
      shot.destroy();
    });
  }

  fire(origin: Vector2, direction: Vector2, config: ShotSpec, effects: WeaponEffects, look?: ShotLook, owner?: object, flight?: ShotFlight): void {
    const shot = new Projectile(this.scene, origin.x, origin.y, look?.texture ?? LOOT_ATLAS.key);
    shot.damage = config.damage;
    shot.knockback = config.knockback;
    shot.expiresAt = this.scene.time.now + config.projectileLifetimeMs;
    shot.status = look?.status ?? effects.shotStatus;
    shot.pierceLeft = flight?.pierce ?? effects.shotPierce + (look?.extraPierce ?? 0);
    shot.bouncesLeft = effects.evolved.ricochet;
    shot.bounceLifetimeMs = effects.evolved.ricochetExtraLifetimeMs;
    shot.vampiric = look?.vampiric ?? false;
    shot.magic = look?.magic ?? false;
    shot.homing = flight?.homing ?? null;
    shot.setDepth(RENDER_DEPTH.projectile);
    if (owner) this.owners.set(shot, owner);

    this.group.add(shot, true);
    // Ciało o promieniu z konfiguracji, wyśrodkowane w klatce 16×16 atlasu.
    const r = config.projectileRadius;
    shot.setCircle(r, shot.width / 2 - r, shot.height / 2 - r);
    const dir = normalize(direction);
    shot.setVelocity(dir.x * config.projectileSpeed, dir.y * config.projectileSpeed);
    // Sprężystość zawsze 1: rykoszet i lustra (krok 160) odbijają; zwykły pocisk i tak rozbija się o mur.
    shot.setBounce(1);
    // Przebijający pocisk to gwiazdka „szurikena” obracana klatkami co 45° (bez obrotu o dowolny kąt).
    if (look?.animation) shot.play(look.animation);
    else if (look) shot.setRotation(Math.atan2(dir.y, dir.x));
    else shot.play(lootAnimationKey(shot.pierceLeft > 0 ? 'shotPierce' : 'shot'));
  }

  /** Zmienne warunki areny (krok 160): lustra odbijają, przeszkody przyjmują trafienie. */
  setTileHook(hook: TileHitHook | null): void {
    this.tileHook = hook;
  }

  /** Pociski w locie (lustra liczą odbicia). */
  get flying(): readonly Projectile[] {
    return this.group.getChildren().filter((c): c is Projectile => c instanceof Projectile && c.active);
  }

  /** `homingTargets` — cele naprowadzanych strzałów (żywi, widoczni wrogowie i boss). */
  update(now: number, resolve: PlayerShotResolver, homingTargets?: () => Iterable<AimTarget>): void {
    const deltaMs = this.scene.game.loop.delta;
    let targets: AimTarget[] | null = null;
    for (const child of [...this.group.getChildren()]) {
      if (!(child instanceof Projectile)) continue;
      if (now >= child.expiresAt) {
        child.destroy();
        continue;
      }
      if (child.homing && child.body && homingTargets) {
        targets ??= [...homingTargets()];
        const steered = steerVelocity({ x: child.x, y: child.y }, child.body.velocity, targets, child.homing, deltaMs);
        child.setVelocity(steered.x, steered.y);
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
      }, this.owners.get(child) ?? null);
      if (!target) continue;
      child.hitTargets.add(target);
      if (child.pierceLeft > 0) child.pierceLeft--;
      else child.destroy();
    }
  }
}
