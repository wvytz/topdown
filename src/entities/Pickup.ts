import Phaser from 'phaser';
import type { ItemId, LootDrop } from '@/core/lootTypes';
import { PickupKind } from '@/core/lootTypes';
import { TextureKey } from '@/core/types';

export function itemTextureKey(id: ItemId): string {
  return `tex-item-${id}`;
}

function textureFor(drop: LootDrop): string {
  switch (drop.kind) {
    case PickupKind.Gold:
      return TextureKey.Coin;
    case PickupKind.Health:
      return TextureKey.HealthPotion;
    case PickupKind.Item:
      return itemTextureKey(drop.itemId);
  }
}

/** Łup leżący na ziemi. Dane (co i ile) niesie `drop`; zbieranie obsługuje LootManager. */
export class Pickup extends Phaser.Physics.Arcade.Image {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly drop: LootDrop,
    /** Czas (ms), od którego łup można zebrać. */
    readonly collectableAt: number,
  ) {
    super(scene, x, y, textureFor(drop));
  }
}
