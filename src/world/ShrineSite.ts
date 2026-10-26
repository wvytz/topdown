import type Phaser from 'phaser';
import type { DungeonFloor } from '@/core/dungeonTypes';
import type { ItemDefinition, ItemId } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { DungeonView } from '@/dungeon/DungeonView';
import { planShrineLocation } from '@/dungeon/ShrinePlanner';
import type { Party } from '@/entities/Party';
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
  /** Bohaterowie (co-op, etap C4): ofiarę składa ten, kto stoi przy kapliczce, i to on dostaje przedmiot. */
  readonly party: Party;
  readonly run: RunState;
  readonly rng: Rng;
  /** Konfiguracja kapliczki na tym piętrze (z uwzględnieniem modyfikatora piętra). */
  readonly config: ShrineConfig;
  /** Wywoływane po udanej ofierze — złoto (wspólne) jest już odjęte; przedmiot daje scena temu bohaterowi. */
  /** Krok 117: pula przedmiotów dla składającego ofiarę (bez tych, które już nic mu nie dadzą). */
  readonly poolFor: (hero: Player) => readonly ItemDefinition[];
  readonly onBlessing: (itemId: ItemId, cost: number, hero: Player) => void;
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

  /** Bohater stoi przy kapliczce i stać go na ofiarę — E zadziała (krok 96, przycisk E na dotyku). */
  get canOffer(): boolean {
    return this.offerable;
  }

  /** `interactPressed(bohater)` — czy ten bohater wcisnął E w tej klatce. */
  update(interactPressed: (hero: Player) => boolean): void {
    this.offerable = false;
    const shrine = this.shrine;
    if (!shrine || shrine.isUsed) return;
    const { party, run, floorNumber } = this.deps;
    const player = party.nearestLiving(shrine);

    if (!player || distance(player, shrine) > this.deps.config.interactRadius) {
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

    if (interactPressed(player)) this.offer(player);
  }

  private offer(hero: Player): void {
    const { run, floorNumber, rng, onBlessing } = this.deps;
    const shrine = this.shrine;
    if (!shrine) return;

    const outcome = makeOffering({
      gold: run.gold,
      floor: floorNumber,
      alreadyUsed: shrine.isUsed,
      config: this.deps.config,
      pool: this.deps.poolFor(hero),
      rng,
    });
    if (!outcome.ok || !run.spendGold(outcome.cost)) return;

    shrine.markUsed();
    onBlessing(outcome.itemId, outcome.cost, hero);
  }
}
