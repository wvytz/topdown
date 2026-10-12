/** Typy domenowe łupów i postępu runu — czyste dane, bez zależności od Phasera. */
import type { IntRange } from '@/core/dungeonTypes';

export enum PickupKind {
  Gold = 'gold',
  Health = 'health',
  Item = 'item',
}

export enum ItemId {
  Blade = 'blade',
  Heart = 'heart',
  Boots = 'boots',
  Gloves = 'gloves',
  Hourglass = 'hourglass',
}

/**
 * Modyfikatory statystyk gracza. Wartości procentowe są ułamkami (0.1 = +10%).
 * Ujemny procent cooldownu = szybciej.
 */
export interface StatModifiers {
  readonly maxHp: number;
  readonly meleeDamage: number;
  readonly moveSpeedPct: number;
  readonly attackCooldownPct: number;
  readonly dashCooldownPct: number;
}

export interface ItemDefinition {
  readonly id: ItemId;
  readonly name: string;
  /** Krótki opis efektu do HUD, np. „+3 obrażeń”. */
  readonly effect: string;
  readonly color: number;
  /** Waga losowania — im większa, tym częściej wypada. */
  readonly weight: number;
  readonly modifiers: Partial<StatModifiers>;
}

export type LootDrop =
  | { readonly kind: PickupKind.Gold; readonly amount: number }
  | { readonly kind: PickupKind.Health; readonly amount: number }
  | { readonly kind: PickupKind.Item; readonly itemId: ItemId };

export interface LootTable {
  readonly gold: IntRange;
  readonly goldChance: number;
  readonly healthChance: number;
  readonly healthAmount: number;
  readonly itemChance: number;
}

export interface LootScalingConfig {
  /** Przyrost złota na piętro powyżej pierwszego (0.2 = +20%). */
  readonly goldPerFloor: number;
}

/** Granice, w których mieszczą się statystyki niezależnie od liczby przedmiotów. */
export interface StatLimits {
  readonly minCooldownMultiplier: number;
  readonly maxMoveSpeedMultiplier: number;
}

/** Stan runu przenoszony między piętrami (przez restart sceny). */
export interface RunSnapshot {
  readonly gold: number;
  readonly items: readonly ItemId[];
  /** null = pełne HP (początek runu). */
  readonly hp: number | null;
}
