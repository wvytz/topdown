import type Phaser from 'phaser';
import type { DungeonFloor, TilePoint } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import { TILE_SIZE } from '@/config/gameConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { STICKY_WEB_VISUAL, SPRITE_SHEETS, animationKey } from '@/config/spriteConfig';
import { planStickyWebs } from '@/dungeon/StickyWebPlanner';
import type { Player } from '@/entities/Player';
import type { StickyWeb, StickyWebConfig } from '@/systems/StickyWebs';
import { isInStickyWeb } from '@/systems/StickyWebs';

export interface StickyWebDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly config: StickyWebConfig;
  readonly rng: Rng;
  readonly player: Player;
  /** Kafle kokonów — pajęczyny omijają je z przerwą. */
  readonly avoid: readonly TilePoint[];
}

/**
 * Lepkie pajęczyny leża (krok 23e): trwałe plamy na podłodze, bez kolizji. Gracz, którego środek
 * jest w pajęczynie, dostaje odnawiane spowolnienie (trwa jeszcze chwilę po wyjściu); dash przechodzi.
 * Wrogów nie spowalniają.
 */
export class StickyWebField {
  readonly webs: readonly StickyWeb[];

  constructor(private readonly deps: StickyWebDeps) {
    this.webs = planStickyWebs(deps.floor, deps.config, deps.rng, deps.avoid);
    for (const { tile, size } of this.webs) {
      const sheet = STICKY_WEB_VISUAL.sheets[size];
      const x = (tile.x + size / 2) * TILE_SIZE;
      const y = (tile.y + size / 2) * TILE_SIZE;
      // Losowa klatka startowa (czysto wizualnie), żeby błyski pajęczyn nie szły równo.
      deps.scene.add
        .sprite(x, y, SPRITE_SHEETS[sheet].key)
        .setDepth(RENDER_DEPTH.floorHazard)
        .play({ key: animationKey(sheet, STICKY_WEB_VISUAL.animation), startFrame: Math.floor(Math.random() * 4) });
    }
  }

  update(now: number): void {
    const { player, config } = this.deps;
    if (isInStickyWeb(this.webs, player, TILE_SIZE)) player.applyTerrainSlow(config.slow, now);
  }
}
