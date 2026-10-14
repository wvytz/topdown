import type Phaser from 'phaser';
import type { DungeonFloor } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { EnemyType } from '@/core/combatTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { ENEMY_VISUALS } from '@/config/spriteConfig';
import { CeilingFallView } from '@/combat/CeilingFallView';
import { DungeonView } from '@/dungeon/DungeonView';
import { roomContainsTile } from '@/dungeon/rooms';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { EnemyManager } from '@/combat/EnemyManager';
import type { Enemy } from '@/entities/Enemy';
import type { Player } from '@/entities/Player';
import type { CeilingDrop, CeilingDropConfig } from '@/systems/CeilingDrops';
import { CeilingDropPlanner, dropShadowRadius } from '@/systems/CeilingDrops';
import { knockbackFrom, scaleForFloor } from '@/systems/CombatMath';

export interface CeilingDropDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  readonly config: CeilingDropConfig;
  readonly rng: Rng;
  readonly player: Player;
  readonly enemies: EnemyManager;
  readonly effects: CombatEffects;
  readonly onPlayerHit: () => void;
}

interface PendingDrop {
  readonly drop: CeilingDrop;
  readonly view: CeilingFallView;
}

/**
 * Pająki z sufitu (krok 23c): planer (czysty) decyduje kiedy i gdzie; tutaj rosnący cień z czerwonym
 * obrysem strefy, nić i spadający pająk w końcówce, a przy lądowaniu obrażenia dla stojącego w cieniu
 * i zwykły Rusher (wariant biomu) w EnemyManager.
 */
export class CeilingDropManager {
  private readonly planner: CeilingDropPlanner;
  private pending: PendingDrop[] = [];
  private readonly dropped = new Set<Enemy>();
  private readonly damage: number;

  constructor(private readonly deps: CeilingDropDeps) {
    this.planner = new CeilingDropPlanner(deps.config, deps.rng);
    this.damage = scaleForFloor(deps.config.damage, deps.floorNumber, ENEMY_SCALING.damagePerFloor);
  }

  update(now: number): void {
    const { player } = this.deps;
    for (const enemy of [...this.dropped]) if (!enemy.active) this.dropped.delete(enemy);

    if (!player.isDead) {
      const room = this.dropRoomAt(player);
      const drop = this.planner.update({
        now,
        player: { x: player.x, y: player.y },
        roomId: room,
        aliveDropped: this.dropped.size + this.pending.length,
        canLandAt: (point) => room !== null && this.dropRoomAt(point) === room,
      });
      if (drop) this.start({ ...drop, damage: this.damage });
    }

    this.pending = this.pending.filter((entry) => {
      if (now < entry.drop.landAt) {
        this.draw(entry, now);
        return true;
      }
      this.land(entry, now);
      return false;
    });
  }

  /** Zwykły pokój pod punktem (świat), w którym wolno zrzucać; null = korytarz, start, arena, mur. */
  private dropRoomAt(point: Vector2): number | null {
    const tile = DungeonView.worldToTile(point.x, point.y);
    const { floor } = this.deps;
    if (floor.tiles[tile.y * floor.width + tile.x] !== TileType.Floor) return null;
    const room = floor.rooms.find((r) => r.kind === RoomKind.Normal && roomContainsTile(r, tile));
    return room?.id ?? null;
  }

  private start(drop: CeilingDrop): void {
    const visual = ENEMY_VISUALS[this.deps.enemies.variantOf(EnemyType.Rusher)];
    this.pending.push({ drop, view: new CeilingFallView(this.deps.scene, drop.position, visual.sheet) });
  }

  private draw({ drop, view }: PendingDrop, now: number): void {
    const { fallMs } = this.deps.config;
    const fallStart = drop.landAt - fallMs;
    view.draw(dropShadowRadius(drop, now), drop.radius, now < fallStart ? null : (now - fallStart) / fallMs);
  }

  private land({ drop, view }: PendingDrop, now: number): void {
    view.destroy();
    const { player, effects, onPlayerHit, enemies } = this.deps;
    effects.impact(drop.position.x, drop.position.y, drop.radius);
    if (!player.isDead && Math.hypot(player.x - drop.position.x, player.y - drop.position.y) <= drop.radius + player.radius) {
      const hit = { damage: drop.damage, knockback: knockbackFrom(drop.position, player, drop.knockback) };
      if (player.takeHit(hit, now)) onPlayerHit();
    }
    this.dropped.add(enemies.spawnAt(EnemyType.Rusher, drop.position));
  }
}
