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
 * Ujemny procent cooldownu = szybciej. Tempo ataku (krok 117) to dodatni procent szybkości: +0,12 = 12% więcej ciosów.
 */
export interface StatModifiers {
  readonly maxHp: number;
  readonly meleeDamage: number;
  readonly moveSpeedPct: number;
  readonly attackSpeedPct: number;
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
  /** Krok 117: tempo ataku z przedmiotów najwyżej +tyle (0,6 = +60%, czas ataku ≥ 1/1,6 bazowego). */
  readonly maxAttackSpeedBonus: number;
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
    /** Krok 93: każda kolejna kopia dodaje tyle razy mniej niż poprzednia (0,5 = połowę). */
    readonly stackDecay: number;
    readonly tickMs: number;
    readonly durationMs: number;
  };
  readonly vampireFang: {
    readonly heal: number;
    readonly healPerStack: number;
    /** Krok 93: malejący przyrost kolejnych kopii, jak w Ognistej pięści. */
    readonly stackDecay: number;
    /** Krok 93: kieł leczy najwyżej tyle maks. HP na sekundę (0,04 = 4%); od kroku 117 bazowego HP bohatera. */
    readonly maxHpPctPerSec: number;
    /** Leczenie najwyżej raz na tyle ms — bez tego szybkie ciosy dają ogromną regenerację. */
    readonly cooldownMs: number;
  };
  readonly stormDash: { readonly damage: number; readonly damagePerStack: number };
  /** Krok 150: przemiany przedmiotów (3. kopia), limity kopii i łańcuch pioruna. */
  readonly evolution: ItemEvolutionConfig;
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

/** Krok 150: opis przemiany przedmiotu na kartach i w HUD. */
export interface ItemEvolutionText {
  /** Nazwa po przemianie, np. „Iskrownik”. */
  readonly name: string;
  /** Co daje przemiana — tekst karty „PRZEMIANA”. */
  readonly effect: string;
  /** Co dają kopie po przemianie; brak = przedmiot ma limit `maxCopies`. */
  readonly after?: string;
  /** Limit kopii: dalsze nic nie dają, więc karty i kapliczka ich nie proponują. */
  readonly maxCopies?: number;
}

/**
 * Krok 150 (decyzja właściciela): 3. kopia przedmiotu to przemiana — nowa mechanika zamiast samej liczby.
 * Liczby w `config/itemEvolutionConfig.ts`.
 */
export interface ItemEvolutionConfig {
  /** Kopia, która przemienia przedmiot. */
  readonly copies: number;
  /** Przedmiot bez wpisu nie ma (jeszcze) przemiany — krok 151: Buty czekają na nowy pomysł. */
  readonly items: Readonly<Partial<Record<ItemId, ItemEvolutionText>>>;
  /** Napompowane serce: przemieniająca kopia daje tyle maks. HP więcej (razem 2× zwykłej kopii). */
  readonly heart: { readonly bonusMaxHp: number };
  /** Elektryczna strzała (kopie 1–2 i dalej): łańcuch pioruna z trafionego celu. */
  readonly chain: { readonly range: number; readonly damageFraction: number; readonly targetsPerCopy: number; readonly maxTargets: number };
  readonly sparker: {
    readonly intervalMs: number;
    readonly intervalStepMs: number;
    readonly minIntervalMs: number;
    readonly range: number;
    readonly damage: number;
    readonly chains: number;
    readonly chainRange: number;
  };
  readonly bladeWave: {
    readonly every: number;
    readonly damageFraction: number;
    readonly speed: number;
    readonly lifetimeMs: number;
    readonly radius: number;
    readonly knockback: number;
  };
  readonly attackRamp: { readonly stepPct: number; readonly steps: number; readonly stepEveryMs: number; readonly resetAfterMs: number };
  readonly hourglass: { readonly dashCharges: number };
  readonly ricochet: { readonly bounces: number; readonly perStack: number; readonly max: number; readonly extraLifetimeMs: number };
  readonly pyre: { readonly radius: number; readonly damage: number; readonly damagePerStack: number };
  readonly quiver: { readonly rechargeMultiplier: number; readonly twinSpreadDeg: number; readonly extraOrbs: number; readonly extraVolleyArrows: number };
  readonly bloodShield: { readonly maxBaseHpPct: number };
  readonly stormTrail: { readonly durationMs: number; readonly tickMs: number; readonly radius: number; readonly damageFraction: number; readonly spacing: number };
  readonly frost: { readonly freezeMs: number; readonly shatterRadius: number; readonly shatterSlow: { readonly pct: number; readonly durationMs: number } };
}
