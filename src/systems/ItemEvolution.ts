import type { ItemDefinition, ItemEvolutionConfig } from '@/core/lootTypes';
import { ItemId } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { pickWeightedItem } from '@/systems/Loot';

/**
 * Przemiany przedmiotów (krok 150, decyzja właściciela): kopie 1–2 wzmacniają liczbę, 3. kopia przemienia przedmiot.
 * Czysta logika: liczenie kopii z limitem, opis karty nagrody i karta rozwoju.
 */

/** Ile kopii każdego przedmiotu ma bohater. */
export function countItems(items: readonly ItemId[]): Map<ItemId, number> {
  const counts = new Map<ItemId, number>();
  for (const id of items) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/** Kopie ponad limit przedmiotu (`maxCopies`) nic nie dają — odrzucamy je przed liczeniem statystyk. */
export function capItemCopies(items: readonly ItemId[], config: ItemEvolutionConfig): ItemId[] {
  const seen = new Map<ItemId, number>();
  return items.filter((id) => {
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    const max = config.items[id]?.maxCopies;
    return max === undefined || count <= max;
  });
}

/** Czy przedmiot w ogóle ma przemianę (krok 151: Buty — jeszcze nie). */
export function hasEvolution(id: ItemId, config: ItemEvolutionConfig): boolean {
  return config.items[id] !== undefined;
}

/** Czy ten przedmiot jest przemieniony: ma przemianę i bohater ma co najmniej `config.copies` kopii. */
export function isItemEvolved(id: ItemId, count: number, config: ItemEvolutionConfig): boolean {
  return hasEvolution(id, config) && isEvolved(count, config);
}

/** Czy przedmiot jest przemieniony (bohater ma co najmniej `config.copies` kopii). */
export function isEvolved(count: number, config: ItemEvolutionConfig): boolean {
  return count >= config.copies;
}

/** Rodzaj karty: nowy przedmiot, kolejna kopia przed przemianą, przemiana albo kopia po przemianie. */
export type RewardCardKind = 'new' | 'growth' | 'evolution' | 'evolved';

export interface RewardCardInfo {
  readonly kind: RewardCardKind;
  /** Nazwa na karcie: po przemianie (i na karcie przemiany) — nazwa przemiany. */
  readonly title: string;
  /** Mniejszy napis pod nazwą, np. „Elektryczna strzała → przemiana”. */
  readonly subtitle: string;
  /** Co da wzięcie tej karty. */
  readonly effect: string;
  /** Kropki postępu: ile wypełnionych po wzięciu karty i ile razem (do przemiany). */
  readonly pips: { readonly filled: number; readonly total: number };
  /** Krótka linia o postępie, np. „poziom 2/3 — jeszcze 1 do przemiany: Iskrownik”. */
  readonly progress: string;
}

/**
 * Opis karty przedmiotu (krok 150, prośba właściciela i testera: karta rozwoju była niejasna). Karta mówi wprost:
 * który to poziom, co da ta kopia i ile brakuje do przemiany (z nazwą przemiany).
 */
export function describeRewardCard(item: ItemDefinition, owned: number, config: ItemEvolutionConfig): RewardCardInfo {
  const evolution = config.items[item.id];
  const after = owned + 1;
  if (!evolution) {
    // Przedmiot bez przemiany (krok 151): zwykła karta, bez kropek postępu.
    return {
      kind: owned === 0 ? 'new' : 'growth',
      title: item.name,
      subtitle: owned === 0 ? 'nowy przedmiot' : `masz ×${owned} — wzmacnia`,
      effect: item.effect,
      pips: { filled: 0, total: 0 },
      progress: 'przemiana w przygotowaniu',
    };
  }
  const total = config.copies;
  const pips = { filled: Math.min(total, after), total };
  if (after < total) {
    const left = total - after;
    return {
      kind: owned === 0 ? 'new' : 'growth',
      title: item.name,
      subtitle: owned === 0 ? 'nowy przedmiot' : `masz ×${owned} — wzmacnia`,
      effect: item.effect,
      pips,
      progress: `jeszcze ${left} do przemiany:\n${evolution.name}`,
    };
  }
  if (after === total) {
    return {
      kind: 'evolution',
      title: evolution.name,
      subtitle: `${item.name} → PRZEMIANA`,
      effect: evolution.effect,
      pips,
      progress: `poziom ${total}/${total} · przemiana!`,
    };
  }
  return {
    kind: 'evolved',
    title: evolution.name,
    subtitle: `masz ×${owned} — przemieniony`,
    effect: evolution.after ?? item.effect,
    pips,
    progress: evolution.maxCopies !== undefined ? `limit ${evolution.maxCopies} kopii` : 'po przemianie — wzmacnia dalej',
  };
}

/** Kandydaci karty rozwoju: przedmioty z puli, których bohater ma 1 … `copies − 1` kopii. */
export function developmentCandidates(
  pool: readonly ItemDefinition[],
  owned: ReadonlyMap<ItemId, number>,
  config: ItemEvolutionConfig,
): ItemDefinition[] {
  return pool.filter((item) => {
    const count = owned.get(item.id) ?? 0;
    return hasEvolution(item.id, config) && count > 0 && count < config.copies;
  });
}

export interface RewardRoll {
  readonly choices: ItemId[];
  /** Karta rozwoju (krok 150): przedmiot, który bohater już zaczął zbierać; null — nie było kandydata. */
  readonly development: ItemId | null;
}

/**
 * Karty za bossa z kartą rozwoju (krok 150): `count` różnych przedmiotów z wagami, a gdy bohater ma przedmiot
 * w trakcie budowy (1–2 kopie), jedna karta zawsze jest takim przedmiotem — przemianę da się zbudować świadomie.
 * Bliższa przemiany (2 kopie) ma podwójną wagę.
 */
export function rollRewardChoices(
  pool: readonly ItemDefinition[],
  count: number,
  rng: Rng,
  ownedItems: readonly ItemId[],
  config: ItemEvolutionConfig,
): RewardRoll {
  const owned = countItems(ownedItems);
  const candidates = developmentCandidates(pool, owned, config).map((item) => ({
    ...item,
    weight: item.weight * ((owned.get(item.id) ?? 0) >= config.copies - 1 ? 2 : 1),
  }));
  const development = candidates.length > 0 ? pickWeightedItem(candidates, rng) : null;
  const rest = pool.filter((item) => item.id !== development);
  const choices: ItemId[] = development ? [development] : [];
  const remaining = [...rest];
  while (choices.length < count && remaining.length > 0) {
    const id = pickWeightedItem(remaining, rng);
    if (id === null) break;
    choices.push(id);
    remaining.splice(
      remaining.findIndex((item) => item.id === id),
      1,
    );
  }
  // Karta rozwoju na losowym miejscu, żeby nie była zawsze pierwsza.
  if (development && choices.length > 1) {
    const slot = rng.int(0, choices.length - 1);
    [choices[0], choices[slot]] = [choices[slot] as ItemId, development];
  }
  return { choices, development };
}

/** Wszystkie przedmioty (do testów i `?items=`). */
export const ALL_ITEM_IDS: readonly ItemId[] = Object.values(ItemId);

/**
 * `?items=` szybkiego startu (krok 150): lista „id*kopie” po przecinku, np. `electric-arrow*3,blade*2`.
 * Zwraca null, gdy parametr to nie lista przedmiotów (np. `0` — wyłączony zestaw).
 */
export function parseItemList(value: string | null): ItemId[] | null {
  if (!value) return null;
  const items: ItemId[] = [];
  for (const part of value.split(',')) {
    const [rawId, rawCount] = part.trim().split('*');
    const id = ALL_ITEM_IDS.find((item) => item === rawId);
    if (!id) continue;
    const copies = rawCount === undefined ? 1 : Number.parseInt(rawCount, 10);
    if (!Number.isFinite(copies) || copies <= 0) continue;
    for (let i = 0; i < Math.min(copies, 20); i++) items.push(id);
  }
  return items.length > 0 ? items : null;
}
