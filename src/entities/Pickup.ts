import Phaser from 'phaser';
import type { ItemId, LootDrop } from '@/core/lootTypes';
import { PickupKind } from '@/core/lootTypes';
import { ITEM_DEFINITIONS } from '@/config/lootConfig';
import { LOOT_ATLAS, LOOT_FRAMES, itemFrames, lootAnimationKey } from '@/config/spriteConfig';

/** Pierwsza klatka ikony przedmiotu w atlasie łupów (także karta nagrody). */
export function itemIconFrame(id: ItemId): string {
  return itemFrames(id, ITEM_DEFINITIONS[id].kind)[0]!;
}

/** Klatka startowa i animacja (moneta się obraca, przedmioty z efektem iskrzą; reszta statyczna). */
function visualFor(drop: LootDrop): { frame: string; animation: string | null } {
  switch (drop.kind) {
    case PickupKind.Gold:
      return { frame: LOOT_FRAMES.coin[0]!, animation: lootAnimationKey('coin') };
    case PickupKind.Health:
      return { frame: LOOT_FRAMES.potion[0]!, animation: null };
    case PickupKind.Item: {
      const frames = itemFrames(drop.itemId, ITEM_DEFINITIONS[drop.itemId].kind);
      return { frame: frames[0]!, animation: frames.length > 1 ? lootAnimationKey(`item-${drop.itemId}`) : null };
    }
  }
}

/** Łup leżący na ziemi. Dane (co i ile) niesie `drop`; zbieranie obsługuje LootManager. */
export class Pickup extends Phaser.Physics.Arcade.Sprite {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly drop: LootDrop,
    /** Czas (ms), od którego łup można zebrać. */
    readonly collectableAt: number,
  ) {
    const visual = visualFor(drop);
    super(scene, x, y, LOOT_ATLAS.key, visual.frame);
    // Różne klatki startowe, żeby monety nie obracały się równo jak w zegarku (czysto wizualne).
    if (visual.animation) this.play({ key: visual.animation, startFrame: Math.floor(Math.random() * 4) });
  }
}
