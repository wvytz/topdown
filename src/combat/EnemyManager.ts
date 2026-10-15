import Phaser from 'phaser';
import type { Hit, MeleeAttackDefinition, ProjectileAttackDefinition } from '@/core/combatTypes';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import { ENEMY_DEFINITIONS, ENEMY_SCALING, ENEMY_VARIANTS } from '@/config/combatConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import { ENEMY_PROJECTILE_VISUALS, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import type { EnemyType, EnemyVariant } from '@/core/combatTypes';
import { enemyDefinitionFor } from '@/systems/EnemyVariants';
import { facingDirection } from '@/systems/Facing';
import type { EnemySpawn } from '@/dungeon/EncounterPlanner';
import { DungeonView } from '@/dungeon/DungeonView';
import { hasLineOfSight } from '@/dungeon/lineOfSight';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { CombatDecals } from '@/effects/CombatDecals';
import type { EnemyAttackHandler } from '@/entities/Enemy';
import { Enemy } from '@/entities/Enemy';
import type { Player } from '@/entities/Player';
import type { ProjectileManager } from '@/combat/ProjectileManager';
import { directionTo, distance, knockbackFrom } from '@/systems/CombatMath';
import { scaleEnemyForFloor } from '@/systems/EnemyScaling';
import type { FloorModifierEffects } from '@/core/floorModifierTypes';
import { applyFloorToEnemy } from '@/systems/FloorModifiers';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import type { DashSweep } from '@/systems/DashStrike';
import { resolveDashSweep } from '@/systems/DashStrike';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot } from '@/systems/ShotResolver';

export interface EnemyManagerDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  /** Modyfikator piętra (prędkość, HP, obrażenia zwykłych wrogów). */
  readonly floorEffects: FloorModifierEffects;
  /** Warianty archetypów w biomie piętra (wygląd i ewentualnie atak). */
  readonly enemyVariants: Readonly<Record<EnemyType, EnemyVariant>>;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  readonly player: Player;
  readonly projectiles: ProjectileManager;
  readonly effects: CombatEffects;
  /** Trwałe ślady walki (plama w miejscu śmierci wroga). */
  readonly decals: CombatDecals;
  readonly onPlayerHit: () => void;
  readonly onEnemyKilled: (enemy: Enemy) => void;
}

/** Spawnuje przeciwników, karmi ich percepcją i rozstrzyga trafienia w obie strony. */
export class EnemyManager implements EnemyAttackHandler {
  private readonly group: Phaser.Physics.Arcade.Group;
  private enemies: Enemy[] = [];

  constructor(private readonly deps: EnemyManagerDeps) {
    this.group = deps.scene.physics.add.group();
    deps.scene.physics.add.collider(this.group, deps.walls);
    deps.scene.physics.add.collider(this.group, this.group);
  }

  get aliveCount(): number {
    return this.enemies.length;
  }

  /** Żywi wrogowie — m.in. do ukrywania ich poza światłem (krok 30). */
  get living(): readonly Enemy[] {
    return this.enemies;
  }

  spawnAll(spawns: readonly EnemySpawn[]): void {
    for (const spawn of spawns) this.spawnAt(spawn.type, DungeonView.tileToWorldCenter(spawn.tile));
  }

  /** Wróg archetypu w wariancie biomu, ze skalowaniem piętra i modyfikatorem (także pająk z sufitu). */
  spawnAt(type: EnemyType, position: Vector2): Enemy {
    const base = enemyDefinitionFor(ENEMY_DEFINITIONS[type], this.deps.enemyVariants[type], ENEMY_VARIANTS);
    const scaled = scaleEnemyForFloor(base, this.deps.floorNumber, ENEMY_SCALING);
    const definition = applyFloorToEnemy(scaled, this.deps.floorEffects);
    const enemy = new Enemy(this.deps.scene, position.x, position.y, definition);
    this.group.add(enemy);
    this.enemies.push(enemy);
    return enemy;
  }

  variantOf(type: EnemyType): EnemyVariant {
    return this.deps.enemyVariants[type];
  }

  update(now: number): void {
    const { player, floor } = this.deps;
    const target: Vector2 = { x: player.x, y: player.y };
    for (const enemy of [...this.enemies]) {
      const burn = enemy.tickBurn(now);
      if (burn > 0) this.deps.effects.floatingText(enemy.x, enemy.y, `-${burn}`, '#ff8a3c');
      if (enemy.isDead) {
        this.kill(enemy);
        continue;
      }
      const canSeeTarget = !player.isDead && hasLineOfSight(floor, enemy, target, TILE_SIZE);
      enemy.tick({ target, canSeeTarget }, now, this);
    }
  }

  /** Cios gracza — trafia wszystkich przeciwników w łuku. Zwraca liczbę trafionych. */
  resolvePlayerMelee(swing: MeleeSwing): number {
    const { hit, killed } = resolveMeleeSwing(swing, [...this.enemies]);
    for (const enemy of killed) this.kill(enemy);
    return hit.length;
  }

  /** Pocisk gracza — zwraca trafionego przeciwnika albo null. */
  resolvePlayerShot(shot: PlayerShot): Enemy | null {
    const result = resolvePlayerShot(shot, this.enemies);
    if (result?.died) this.kill(result.target);
    return result?.target ?? null;
  }

  /** Burzowy pęd: rani przeciwników dotkniętych w trakcie dasha (każdego raz na dash). */
  resolveDashSweep(sweep: DashSweep, alreadyHit: Set<object>): void {
    const { hit, killed } = resolveDashSweep(sweep, [...this.enemies], alreadyHit);
    for (const enemy of hit) this.deps.effects.floatingText(enemy.x, enemy.y, `-${sweep.damage}`, '#b8a8ff');
    for (const enemy of killed) this.kill(enemy);
  }

  meleeStrike(enemy: Enemy, attack: MeleeAttackDefinition): void {
    const { player, scene } = this.deps;
    // Sprawdzamy w chwili uderzenia, nie zamachu — gracz może uciec z zasięgu podczas telegrafu.
    if (distance(enemy, player) > attack.hitRange) return;
    const hit: Hit = {
      damage: attack.damage,
      knockback: knockbackFrom(enemy, player, attack.knockback),
      ...(attack.status && { status: attack.status }),
    };
    if (player.takeHit(hit, scene.time.now)) this.deps.onPlayerHit();
  }

  fireProjectile(enemy: Enemy, attack: ProjectileAttackDefinition, target: Vector2): void {
    const direction = directionTo(enemy, target);
    // Pocisk startuje kawałek przed strzelcem (wg sprite'ów), w kierunku rzutu.
    const look = ENEMY_PROJECTILE_VISUALS[enemy.definition.variant];
    const offset = look?.forwardOffset ?? 0;
    // Fala ma wiersze kierunków lotu (8 klatek obrotu co 45°), kula maga jest bez kierunków.
    const row = look?.directional ? (facingDirection(direction) ?? 0) : 0;
    this.deps.projectiles.fire({
      origin: { x: enemy.x + direction.x * offset, y: enemy.y + direction.y * offset },
      direction,
      ...(look && {
        visual: { texture: SPRITE_SHEETS[look.sheet].key, animation: animationKey(look.sheet, look.animation, row) },
      }),
      speed: attack.projectileSpeed,
      damage: attack.damage,
      knockback: attack.knockback,
      lifetimeMs: attack.projectileLifetimeMs,
      ...(attack.wave && { wave: attack.wave }),
      ...(attack.status && { status: attack.status }),
    });
  }

  private kill(enemy: Enemy): void {
    this.deps.effects.deathBurst(enemy.x, enemy.y, enemy.definition.color, enemy.radius);
    this.deps.decals.add('splat', enemy.x, enemy.y);
    this.enemies = this.enemies.filter((e) => e !== enemy);
    this.deps.onEnemyKilled(enemy);
    enemy.destroy();
  }
}
