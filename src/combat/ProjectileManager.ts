import Phaser from 'phaser';
import type { Vector2 } from '@/core/types';
import type { WaveShape } from '@/core/combatTypes';
import { isHitByWave } from '@/systems/EnemyVariants';
import type { Player } from '@/entities/Player';
import { Projectile } from '@/entities/Projectile';
import { PROJECTILE_RADIUS } from '@/config/combatConfig';
import { knockbackFrom, normalize } from '@/systems/CombatMath';
import { RENDER_DEPTH } from '@/config/renderLayers';
import type { CombatDecalKind } from '@/config/dressingConfig';
import type { CombatDecals } from '@/effects/CombatDecals';

export interface ProjectileSpec {
  readonly origin: Vector2;
  /** Kierunek lotu (nie musi być znormalizowany). */
  readonly direction: Vector2;
  readonly speed: number;
  readonly damage: number;
  readonly knockback: number;
  readonly lifetimeMs: number;
  /** Wygląd z arkusza sprite'ów (np. kula maga); brak = domyślny pomarańczowy pocisk. */
  readonly visual?: { readonly texture: string; readonly animation: string };
  /** Ślad na podłodze, gdy pocisk rozbije się o ścianę albo wygaśnie (np. szlam bossa). */
  readonly impactDecal?: CombatDecalKind;
  /** Fala (nietoperz): trafia w całej szerokości półksiężyca zamiast w okręgu ciała. */
  readonly wave?: WaveShape;
}

/** Pociski przeciwników: lot, kolizja ze ścianami, trafienie gracza, wygasanie. */
export class ProjectileManager {
  private readonly group: Phaser.Physics.Arcade.Group;
  /** Ślady zostawiane przez pociski (pocisk → rodzaj śladu); tylko pociski z `impactDecal`. */
  private readonly impactDecals = new WeakMap<Projectile, CombatDecalKind>();
  /** Kształt fal — trafienie liczymy sami (czysta funkcja), nie przez okrągłe ciało fizyczne. */
  private readonly waves = new WeakMap<Projectile, WaveShape>();

  constructor(
    private readonly scene: Phaser.Scene,
    walls: Phaser.Tilemaps.TilemapLayer,
    private readonly player: Player,
    private readonly onPlayerHit: () => void,
    private readonly decals?: CombatDecals,
  ) {
    this.group = scene.physics.add.group({ classType: Projectile });

    scene.physics.add.collider(this.group, walls, (projectile) => {
      if (projectile instanceof Projectile) this.splash(projectile);
    });
    scene.physics.add.overlap(player, this.group, (_player, projectile) => {
      if (projectile instanceof Projectile && !this.waves.has(projectile)) this.handlePlayerOverlap(projectile);
    });
  }

  fire(spec: ProjectileSpec): void {
    const projectile = new Projectile(this.scene, spec.origin.x, spec.origin.y, spec.visual?.texture);
    projectile.damage = spec.damage;
    projectile.knockback = spec.knockback;
    projectile.expiresAt = this.scene.time.now + spec.lifetimeMs;
    projectile.setDepth(RENDER_DEPTH.projectile);

    this.group.add(projectile, true);
    // Ciało zawsze o promieniu PROJECTILE_RADIUS, wyśrodkowane w klatce (kula maga ma 16×16).
    projectile.setCircle(PROJECTILE_RADIUS, projectile.width / 2 - PROJECTILE_RADIUS, projectile.height / 2 - PROJECTILE_RADIUS);
    if (spec.visual) projectile.play(spec.visual.animation);
    if (spec.impactDecal) this.impactDecals.set(projectile, spec.impactDecal);
    if (spec.wave) this.waves.set(projectile, spec.wave);
    const dir = normalize(spec.direction);
    projectile.setVelocity(dir.x * spec.speed, dir.y * spec.speed);
  }

  update(now: number): void {
    for (const child of [...this.group.getChildren()]) {
      if (!(child instanceof Projectile)) continue;
      if (now >= child.expiresAt) {
        this.splash(child);
        continue;
      }
      const wave = this.waves.get(child);
      const velocity = child.body?.velocity;
      if (wave && velocity && isHitByWave(child, velocity, wave, this.player, this.player.radius)) {
        this.handlePlayerOverlap(child);
      }
    }
  }

  /** Koniec lotu (ściana albo wygaśnięcie): ślad na podłodze, jeśli pocisk go zostawia. */
  private splash(projectile: Projectile): void {
    const kind = this.impactDecals.get(projectile);
    if (kind) this.decals?.add(kind, projectile.x, projectile.y);
    projectile.destroy();
  }

  private handlePlayerOverlap(projectile: Projectile): void {
    const now = this.scene.time.now;
    const velocity = projectile.body?.velocity;
    // Odrzut w kierunku lotu pocisku.
    const from = velocity
      ? { x: projectile.x - velocity.x, y: projectile.y - velocity.y }
      : { x: projectile.x, y: projectile.y };
    const hit = { damage: projectile.damage, knockback: knockbackFrom(from, this.player, projectile.knockback) };

    // Dash/nietykalność: pocisk przelatuje przez gracza.
    if (this.player.takeHit(hit, now)) {
      projectile.destroy();
      this.onPlayerHit();
    }
  }
}
