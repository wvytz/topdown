import Phaser from 'phaser';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';
import { SPRITE_SHEETS, WALL_DOG_VISUAL } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { DungeonView } from '@/dungeon/DungeonView';
import type { WallDogSpot } from '@/dungeon/WallDogPlanner';
import { planWallDogs } from '@/dungeon/WallDogPlanner';
import type { CombatEffects } from '@/effects/CombatEffects';
import type { Party } from '@/entities/Party';
import type { WallDogConfig } from '@/systems/WallDogs';
import { WallDogPhase, WallDogState } from '@/systems/WallDogs';

export interface WallDogDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly config: WallDogConfig;
  readonly rng: Rng;
  /** Bohaterowie (co-op, etap C0). */
  readonly party: Party;
  readonly effects: CombatEffects;
  /** Wielki czarny dog wypadający na podłogę przed dziurą (zwykły Rusher biomu). */
  readonly spawnDog: (at: Vector2) => void;
}

interface Entry {
  readonly spot: WallDogSpot;
  readonly at: Vector2;
  readonly state: WallDogState;
  readonly sprite: Phaser.GameObjects.Sprite;
  shownStage: number;
}

/**
 * Psy w ścianach (krok 84): rysa w murze budzi się, gdy gracz podejdzie do krawędzi pokoju; mur pęka (drży,
 * rysa rośnie, kurz), potem pękają kamienie i wypada pies. Dziura zostaje w murze na stałe (bez zmiany kolizji).
 */
export class WallDogManager {
  private readonly entries: Entry[] = [];

  constructor(private readonly deps: WallDogDeps) {
    const sheet = SPRITE_SHEETS[WALL_DOG_VISUAL.sheet].key;
    for (const spot of planWallDogs(deps.floor, deps.config, deps.rng)) {
      const at = DungeonView.tileToWorldCenter(spot.wall);
      const sprite = deps.scene.add.sprite(at.x, at.y, sheet, 0).setDepth(RENDER_DEPTH.overheadDecor);
      this.entries.push({ spot, at, state: new WallDogState(deps.config), sprite, shownStage: 0 });
    }
  }

  get count(): number {
    return this.entries.length;
  }

  update(now: number): void {
    const { party, config, effects, scene } = this.deps;
    for (const entry of this.entries) {
      const { state, sprite, at } = entry;
      // Pies wyskakuje na najbliższego żywego bohatera.
      const nearest = party.nearestLiving(at);
      const target = nearest ? { x: nearest.x, y: nearest.y } : null;
      const before = state.phase;
      const burst = state.update(at, target, now);
      if (before === WallDogPhase.Dormant && state.phase === WallDogPhase.Cracking) {
        scene.cameras.main.shake(config.crackMs, WALL_DOG_VISUAL.shake);
        effects.floatingText(at.x, at.y - 22, WALL_DOG_VISUAL.warnText, WALL_DOG_VISUAL.warnColor);
      }
      if (state.phase === WallDogPhase.Cracking) {
        // Rysa rośnie (klatki 0–2) i mur drży.
        const stage = Math.min(2, Math.floor(state.crackProgress(now) * 3));
        if (stage !== entry.shownStage) {
          entry.shownStage = stage;
          sprite.setFrame(stage);
          effects.impact(at.x, at.y, 8);
        }
        sprite.setPosition(at.x + Phaser.Math.Between(-1, 1), at.y);
      }
      if (burst) {
        sprite.setPosition(at.x, at.y).setFrame(WALL_DOG_VISUAL.holeFrame);
        effects.impact(at.x, at.y, 28);
        effects.deathBurst(at.x, at.y, WALL_DOG_VISUAL.rubbleColor, 18);
        scene.cameras.main.shake(WALL_DOG_VISUAL.burstShake.durationMs, WALL_DOG_VISUAL.burstShake.intensity);
        this.deps.spawnDog(DungeonView.tileToWorldCenter(entry.spot.floorTile));
      }
    }
  }
}
