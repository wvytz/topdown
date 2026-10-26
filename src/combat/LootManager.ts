import Phaser from 'phaser';
import type { LootDrop } from '@/core/lootTypes';
import { PickupKind } from '@/core/lootTypes';
import type { Vector2 } from '@/core/types';
import { PICKUP_CONFIG } from '@/config/lootConfig';
import { Pickup } from '@/entities/Pickup';
import type { Party } from '@/entities/Party';
import type { Player } from '@/entities/Player';
import { directionTo, distance } from '@/systems/CombatMath';
import { splitGold } from '@/systems/Loot';
import { RENDER_DEPTH } from '@/config/renderLayers';

export interface LootManagerDeps {
  readonly scene: Phaser.Scene;
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  /** Bohaterowie (co-op, etap C0): łup zbiera najbliższy żywy, który może go wziąć. */
  readonly party: Party;
  /** Czy ten bohater może teraz zebrać ten łup (np. mikstura przy pełnym HP — nie). */
  readonly canCollect: (drop: LootDrop, collector: Player) => boolean;
  readonly onCollect: (drop: LootDrop, position: Vector2, collector: Player) => void;
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
    const { party, canCollect, onCollect } = this.deps;
    for (const child of [...this.group.getChildren()]) {
      if (!(child instanceof Pickup) || now < child.collectableAt) continue;
      const player = this.collectorFor(child, party, canCollect);
      if (!player) continue;

      const dist = distance(child, player);
      if (dist <= PICKUP_CONFIG.collectRadius) {
        onCollect(child.drop, { x: child.x, y: child.y }, player);
        child.destroy();
      } else if (dist <= PICKUP_CONFIG.magnetRadius) {
        const dir = directionTo(child, player);
        child.setVelocity(dir.x * PICKUP_CONFIG.magnetSpeed, dir.y * PICKUP_CONFIG.magnetSpeed);
      }
    }
  }

  /** Najbliższy żywy bohater, który może wziąć łup (solo: gracz, o ile żyje i może). */
  private collectorFor(pickup: Pickup, party: Party, canCollect: LootManagerDeps['canCollect']): Player | null {
    let best: Player | null = null;
    for (const player of party.living) {
      if (!canCollect(pickup.drop, player)) continue;
      if (!best || distance(pickup, player) < distance(pickup, best)) best = player;
    }
    return best;
  }

  /** Zbiera od razu wszystko, co leży (teleport na kolejną arenę, krok 90) — łup nie przepada. */
  collectAll(): void {
    for (const child of [...this.group.getChildren()]) {
      if (!(child instanceof Pickup)) continue;
      // Areny bossów są tylko dla gry solo — łup bierze pierwszy gracz.
      this.deps.onCollect(child.drop, { x: child.x, y: child.y }, this.deps.party.leader);
      child.destroy();
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
