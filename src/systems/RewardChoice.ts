import type { ItemDefinition, ItemId } from '@/core/lootTypes';
import type { Rng } from '@/core/random';
import { pickWeightedItem } from '@/systems/Loot';

/**
 * Karty nagrody za bossa: `count` różnych przedmiotów losowanych z wagami (bez powtórzeń).
 * Gdy pula jest mniejsza niż `count`, zwraca wszystkie dostępne.
 */
export function rollItemChoices(pool: readonly ItemDefinition[], count: number, rng: Rng): ItemId[] {
  const remaining = [...pool];
  const choices: ItemId[] = [];
  while (choices.length < count && remaining.length > 0) {
    const id = pickWeightedItem(remaining, rng);
    if (id === null) break;
    choices.push(id);
    remaining.splice(
      remaining.findIndex((item) => item.id === id),
      1,
    );
  }
  return choices;
}
