import Phaser from 'phaser';
import type { LootDrop } from '@/core/lootTypes';
import { PickupKind } from '@/core/lootTypes';
import type { Vector2 } from '@/core/types';
import { PICKUP_CONFIG } from '@/config/lootConfig';
import { Pickup } from '@/entities/Pickup';
import type { Player } from '@/entities/Player';
import { directionTo, distance } from '@/systems/CombatMath';
import { splitGold } from '@/systems/Loot';
import { RENDER_DEPTH } from '@/config/renderLayers';

export interface LootManagerDeps {
  readonly scene: Phaser.Scene;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  readonly player: Player;
  /** Czy gracz może teraz zebrać ten łup (np. mikstura przy pełnym HP — nie). */
  readonly canCollect: (drop: LootDrop) => boolean;
  readonly onCollect: (drop: LootDrop, position: Vector2) => void;
}

/** Łupy na ziemi: rozsypanie, przyciąganie do gracza (magnes), zebranie. */
export class LootManager {
  private readonly group: Phaser.Physics.Arcade.Group;

  constructor(private readonly deps: LootManagerDeps) {
    this.group = deps.scene.physics.add.group();
    deps.scene.physics.add.collider(this.group, deps.walls);
  }

  spawn(position: Vector2, drops: readonly LootDrop[]): void {
    for (const drop of drops) {
      if (drop.kind === PickupKind.Gold) {
        for (const amount of splitGold(drop.amount, PICKUP_CONFIG.maxCoinsPerDrop)) {
          this.spawnOne(position, { kind: PickupKind.Gold, amount });
        }
      } else {
        this.spawnOne(position, drop);
      }
    }
  }

  update(now: number): void {
    const { player, canCollect, onCollect } = this.deps;
    for (const child of [...this.group.getChildren()]) {
      if (!(child instanceof Pickup) || now < child.collectableAt) continue;
      if (player.isDead || !canCollect(child.drop)) continue;

      const dist = distance(child, player);
      if (dist <= PICKUP_CONFIG.collectRadius) {
        onCollect(child.drop, { x: child.x, y: child.y });
        child.destroy();
      } else if (dist <= PICKUP_CONFIG.magnetRadius) {
        const dir = directionTo(child, player);
        child.setVelocity(dir.x * PICKUP_CONFIG.magnetSpeed, dir.y * PICKUP_CONFIG.magnetSpeed);
      }
    }
  }

  private spawnOne(position: Vector2, drop: LootDrop): void {
    const scene = this.deps.scene;
    const pickup = new Pickup(scene, position.x, position.y, drop, scene.time.now + PICKUP_CONFIG.collectDelayMs);
    this.group.add(pickup, true);
    pickup.setDepth(drop.kind === PickupKind.Item ? RENDER_DEPTH.item : RENDER_DEPTH.coin);

    // Rozsypanie w losowym kierunku — czysto wizualne, więc Math.random zamiast RNG piętra.
    const angle = Math.random() * Math.PI * 2;
    const speed = PICKUP_CONFIG.scatterSpeed * (0.5 + Math.random() * 0.5);
    pickup.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    pickup.setDrag(300, 300);
    // Bez pulsowania skalą (niecałkowita skala psuje piksele): przedmioty wyróżniają ikona,
    // a przedmioty z efektem także złota obwódka i iskra (krok 20).
  }
}
