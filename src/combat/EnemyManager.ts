import Phaser from 'phaser';
import type { Hit, MeleeAttackDefinition, ProjectileAttackDefinition } from '@/core/combatTypes';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';
import { ENEMY_DEFINITIONS, ENEMY_SCALING } from '@/config/combatConfig';
import { TILE_SIZE } from '@/config/gameConfig';
import type { EnemySpawn } from '@/dungeon/EncounterPlanner';
import { DungeonView } from '@/dungeon/DungeonView';
import { hasLineOfSight } from '@/dungeon/lineOfSight';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { EnemyAttackHandler } from '@/entities/Enemy';
import { Enemy } from '@/entities/Enemy';
import type { Player } from '@/entities/Player';
import type { ProjectileManager } from '@/combat/ProjectileManager';
import { directionTo, distance, knockbackFrom } from '@/systems/CombatMath';
import { scaleEnemyForFloor } from '@/systems/EnemyScaling';
import type { MeleeSwing } from '@/systems/MeleeResolver';
import { resolveMeleeSwing } from '@/systems/MeleeResolver';
import type { PlayerShot } from '@/systems/ShotResolver';
import { resolvePlayerShot } from '@/systems/ShotResolver';

export interface EnemyManagerDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  readonly player: Player;
  readonly projectiles: ProjectileManager;
  readonly effects: CombatEffects;
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

  spawnAll(spawns: readonly EnemySpawn[]): void {
    for (const spawn of spawns) {
      const definition = scaleEnemyForFloor(ENEMY_DEFINITIONS[spawn.type], this.deps.floorNumber, ENEMY_SCALING);
      const position = DungeonView.tileToWorldCenter(spawn.tile);
      const enemy = new Enemy(this.deps.scene, position.x, position.y, definition);
      this.group.add(enemy);
      this.enemies.push(enemy);
    }
  }

  update(now: number): void {
    const { player, floor } = this.deps;
    const target: Vector2 = { x: player.x, y: player.y };
    for (const enemy of this.enemies) {
      const canSeeTarget = !player.isDead && hasLineOfSight(floor, enemy, target, TILE_SIZE);
      enemy.tick({ target, canSeeTarget }, now, this);
    }
  }

  /** Cios gracza — trafia wszystkich przeciwników w łuku. */
  resolvePlayerMelee(swing: MeleeSwing): void {
    for (const enemy of resolveMeleeSwing(swing, [...this.enemies])) this.kill(enemy);
  }

  /** Pocisk gracza — true, jeśli trafił któregoś z przeciwników. */
  resolvePlayerShot(shot: PlayerShot): boolean {
    const result = resolvePlayerShot(shot, this.enemies);
    if (result?.died) this.kill(result.target);
    return result !== null;
  }

  meleeStrike(enemy: Enemy, attack: MeleeAttackDefinition): void {
    const { player, scene } = this.deps;
    // Sprawdzamy w chwili uderzenia, nie zamachu — gracz może uciec z zasięgu podczas telegrafu.
    if (distance(enemy, player) > attack.hitRange) return;
    const hit: Hit = { damage: attack.damage, knockback: knockbackFrom(enemy, player, attack.knockback) };
    if (player.takeHit(hit, scene.time.now)) this.deps.onPlayerHit();
  }

  fireProjectile(enemy: Enemy, attack: ProjectileAttackDefinition, target: Vector2): void {
    this.deps.projectiles.fire({
      origin: { x: enemy.x, y: enemy.y },
      direction: directionTo(enemy, target),
      speed: attack.projectileSpeed,
      damage: attack.damage,
      knockback: attack.knockback,
      lifetimeMs: attack.projectileLifetimeMs,
    });
  }

  private kill(enemy: Enemy): void {
    this.deps.effects.deathBurst(enemy.x, enemy.y, enemy.definition.color, enemy.radius);
    this.enemies = this.enemies.filter((e) => e !== enemy);
    this.deps.onEnemyKilled(enemy);
    enemy.destroy();
  }
}
