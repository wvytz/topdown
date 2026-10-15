import type Phaser from 'phaser';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { ItemId } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { ITEM_POOL } from '@/config/lootConfig';
import { DungeonView } from '@/dungeon/DungeonView';
import { planShrineLocation } from '@/dungeon/ShrinePlanner';
import type { Player } from '@/entities/Player';
import { Shrine } from '@/entities/Shrine';
import { distance } from '@/systems/CombatMath';
import type { RunState } from '@/systems/RunState';
import type { ShrineConfig } from '@/systems/Shrine';
import { makeOffering, shrineCost } from '@/systems/Shrine';

export interface ShrineSiteDeps {
  readonly scene: Phaser.Scene;
  readonly floor: DungeonFloor;
  readonly floorNumber: number;
  readonly player: Player;
  readonly run: RunState;
  readonly rng: Rng;
  /** Konfiguracja kapliczki na tym piętrze (z uwzględnieniem modyfikatora piętra). */
  readonly config: ShrineConfig;
  /** Wywoływane po udanej ofierze — złoto jest już odjęte, przedmiot dodany do runu. */
  readonly onBlessing: (itemId: ItemId, cost: number) => void;
}

/** Kapliczka na piętrze: podpowiedź w pobliżu i ofiara złota pod klawiszem E. */
export class ShrineSite {
  private readonly shrine: Shrine | null;
  private offerable = false;

  constructor(private readonly deps: ShrineSiteDeps) {
    const tile = planShrineLocation(deps.floor, deps.rng);
    if (!tile) {
      this.shrine = null;
      return;
    }
    const position = DungeonView.tileToWorldCenter(tile);
    this.shrine = new Shrine(deps.scene, position.x, position.y);
  }

  /** Gracz stoi przy kapliczce i stać go na ofiarę — E zadziała (przycisk dotykowy E, krok 49c). */
  get canOffer(): boolean {
    return this.offerable;
  }

  update(interactPressed: boolean): void {
    this.offerable = false;
    const shrine = this.shrine;
    if (!shrine || shrine.isUsed) return;
    const { player, run, floorNumber } = this.deps;

    if (player.isDead || distance(player, shrine) > this.deps.config.interactRadius) {
      shrine.hidePrompt();
      return;
    }

    const cost = shrineCost(floorNumber, this.deps.config);
    const affordable = run.gold >= cost;
    this.offerable = affordable;
    shrine.showPrompt(
      affordable ? `[E] Ofiara: ${cost} złota\nlosowy bonus` : `Kapliczka: potrzeba ${cost} złota`,
      affordable ? '#ffe08a' : '#ff8080',
    );

    if (interactPressed) this.offer();
  }

  private offer(): void {
    const { run, floorNumber, rng, onBlessing } = this.deps;
    const shrine = this.shrine;
    if (!shrine) return;

    const outcome = makeOffering({
      gold: run.gold,
      floor: floorNumber,
      alreadyUsed: shrine.isUsed,
      config: this.deps.config,
      pool: ITEM_POOL,
      rng,
    });
    if (!outcome.ok || !run.spendGold(outcome.cost)) return;

    run.addItem(outcome.itemId);
    shrine.markUsed();
    onBlessing(outcome.itemId, outcome.cost);
  }
}
