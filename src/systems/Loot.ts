import type { ItemDefinition, ItemId, LootDrop, LootScalingConfig, LootTable } from '@/core/lootTypes';
import { PickupKind } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { scaleForFloor } from '@/systems/CombatMath';

/** Losuje łupy z tabeli. Każdy rodzaj (złoto / mikstura / przedmiot) losowany niezależnie. */
export function rollLoot(
  table: LootTable,
  floor: number,
  scaling: LootScalingConfig,
  items: readonly ItemDefinition[],
  rng: Rng,
): LootDrop[] {
  const drops: LootDrop[] = [];

  if (rng.next() < table.goldChance) {
    const base = rng.int(table.gold.min, table.gold.max);
    const amount = scaleForFloor(base, floor, scaling.goldPerFloor);
    if (amount > 0) drops.push({ kind: PickupKind.Gold, amount });
  }
  if (rng.next() < table.healthChance) {
    drops.push({ kind: PickupKind.Health, amount: table.healthAmount });
  }
  if (rng.next() < table.itemChance) {
    const itemId = pickWeightedItem(items, rng);
    if (itemId !== null) drops.push({ kind: PickupKind.Item, itemId });
  }
  return drops;
}

/** Losowanie ważone; null tylko dla pustej puli (lub same zerowe wagi). */
export function pickWeightedItem(items: readonly ItemDefinition[], rng: Rng): ItemId | null {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll < 0) return item.id;
  }
  return items.at(-1)?.id ?? null;
}

/**
 * Dzieli kwotę złota na monety (czysto wizualnie — więcej monet = przyjemniejszy „wybuch”).
 * Suma monet zawsze równa się kwocie, a żadna moneta nie jest pusta.
 */
export function splitGold(amount: number, maxCoins: number): number[] {
  if (amount <= 0) return [];
  const coins = Math.max(1, Math.min(maxCoins, amount));
  const base = Math.floor(amount / coins);
  const remainder = amount % coins;
  return Array.from({ length: coins }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Lot złota do bohatera (krok 143): prędkość startowa, przyspieszenie (px/s²) i sufit (px/s). */
export interface GoldHomingConfig {
  readonly startSpeed: number;
  readonly acceleration: number;
  readonly maxSpeed: number;
}

/** Prędkość monety po `elapsedMs` lotu: rośnie liniowo od startowej do sufitu. */
export function goldHomingSpeed(config: GoldHomingConfig, elapsedMs: number): number {
  const t = Math.max(0, elapsedMs) / 1000;
  return Math.min(config.maxSpeed, config.startSpeed + config.acceleration * t);
}

/**
 * Czy moneta dolatuje w tej klatce: jest w zasięgu zebrania albo przeleciałaby bohatera w jednym kroku
 * (szybka moneta przy niskim FPS nie krąży wokół celu).
 */
export function goldArrives(distance: number, speed: number, deltaMs: number, collectRadius: number): boolean {
  return distance <= Math.max(collectRadius, (speed * Math.max(0, deltaMs)) / 1000);
}
