import type { ItemDefinition, ItemId } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { scaleForFloor } from '@/systems/CombatMath';
import { pickWeightedItem } from '@/systems/Loot';

export interface ShrineConfig {
  readonly baseCost: number;
  /** Przyrost kosztu na piętro powyżej pierwszego (0.3 = +30%). */
  readonly costPerFloor: number;
  /** Odległość (px), z której można złożyć ofiarę. */
  readonly interactRadius: number;
}

export enum ShrineRefusal {
  AlreadyUsed = 'already-used',
  NotEnoughGold = 'not-enough-gold',
  EmptyPool = 'empty-pool',
}

export type ShrineOutcome =
  | { readonly ok: true; readonly itemId: ItemId; readonly cost: number }
  | { readonly ok: false; readonly reason: ShrineRefusal; readonly cost: number };

export function shrineCost(floor: number, config: ShrineConfig): number {
  return scaleForFloor(config.baseCost, floor, config.costPerFloor);
}

export interface OfferingInput {
  readonly gold: number;
  readonly floor: number;
  readonly alreadyUsed: boolean;
  readonly config: ShrineConfig;
  readonly pool: readonly ItemDefinition[];
  readonly rng: Rng;
}

/**
 * Ofiara złota w kapliczce: za koszt zależny od piętra daje losowy bonus z puli przedmiotów.
 * Funkcja tylko rozstrzyga — odjęcie złota i dodanie przedmiotu robi wywołujący.
 */
export function makeOffering(input: OfferingInput): ShrineOutcome {
  const cost = shrineCost(input.floor, input.config);
  if (input.alreadyUsed) return { ok: false, reason: ShrineRefusal.AlreadyUsed, cost };
  if (input.gold < cost) return { ok: false, reason: ShrineRefusal.NotEnoughGold, cost };
  const itemId = pickWeightedItem(input.pool, input.rng);
  if (itemId === null) return { ok: false, reason: ShrineRefusal.EmptyPool, cost };
  return { ok: true, itemId, cost };
}
