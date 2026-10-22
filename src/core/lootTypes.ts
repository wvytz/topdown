/** Typy domenowe łupów i postępu runu — czyste dane, bez zależności od Phasera. */
import type { IntRange } from '@/core/dungeonTypes';
import type { HeroId } from '@/core/heroTypes';
import type { RunMode } from '@/core/runMode';

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
  // Przedmioty z efektem broni (rzadsze).
  Shuriken = 'shuriken',
  ElectricArrow = 'electric-arrow',
  FireFist = 'fire-fist',
  Quiver = 'quiver',
  VampireFang = 'vampire-fang',
  StormDash = 'storm-dash',
  FrostShard = 'frost-shard',
}

export enum ItemKind {
  /** Zmienia liczby (HP, obrażenia, cooldowny). */
  Stat = 'stat',
  /** Dodaje efekt broni (przebicie, podpalenie, ogłuszenie…). Kolejne kopie go wzmacniają. */
  Effect = 'effect',
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
  /** Dodatkowe ładunki strzału. */
  readonly rangedCharges: number;
}

export interface ItemDefinition {
  readonly id: ItemId;
  readonly kind: ItemKind;
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
  readonly maxRangedCharges: number;
}

/**
 * Siła efektów przedmiotów: wartość dla pierwszej kopii + przyrost za każdą kolejną.
 * Liczby trzymamy w config/lootConfig.ts.
 */
export interface ItemEffectsConfig {
  readonly shuriken: { readonly pierce: number; readonly piercePerStack: number };
  readonly electricArrow: { readonly stunMs: number; readonly stunMsPerStack: number };
  readonly fireFist: {
    readonly tickDamage: number;
    readonly tickDamagePerStack: number;
    readonly tickMs: number;
    readonly durationMs: number;
  };
  readonly vampireFang: {
    readonly heal: number;
    readonly healPerStack: number;
    /** Leczenie najwyżej raz na tyle ms — bez tego szybkie ciosy dają ogromną regenerację. */
    readonly cooldownMs: number;
  };
  readonly stormDash: { readonly damage: number; readonly damagePerStack: number };
  readonly frostShard: {
    readonly slowPct: number;
    readonly slowPctPerStack: number;
    readonly maxSlowPct: number;
    readonly durationMs: number;
  };
}

/** Stan runu przenoszony między piętrami (przez restart sceny). */
export interface RunSnapshot {
  /** Bohater wybrany na cały run (krok 37). */
  readonly hero: HeroId;
  readonly gold: number;
  readonly items: readonly ItemId[];
  /** null = pełne HP (początek runu). */
  readonly hp: number | null;
  /** Run testowy (start z `?floor=`/`?seed=`, krok 41g): wynik nie trafia na tablicę. */
  readonly practice?: boolean;
  /** Tryb gry (krok 90); brak = wspinaczka. */
  readonly mode?: RunMode;
  /** Run wczytany z ręcznego slotu zapisu (krok 91): wynik nie trafia na tablicę. */
  readonly fromSave?: boolean;
  /** Wybór piętra (krok 91): piętro startowe — R po śmierci zaczyna od niego. */
  readonly startFloor?: number;
}
