import type { HeroDefinition } from '@/core/heroTypes';
import type { ItemDefinition, ItemEffectsConfig, ItemId, StatLimits } from '@/core/lootTypes';
import { computeHeroLoadout } from '@/systems/PlayerLoadout';

/**
 * Krok 117 (ocena właściciela: część kopii Butów i Klepsydry nic nie dawała): przedmiot, który bohaterowi
 * już nic nie zmieni (statystyka na limicie, efekt bez dalszego przyrostu), nie trafia na karty za bossa
 * ani do kapliczki — w jego miejsce losuje się coś, co działa. Łupy z ziemi zostają bez zmian (w co-opie
 * może je wziąć partner). Gdy nic nie zostanie, wraca pełna pula.
 */
export function usefulItemPool(
  pool: readonly ItemDefinition[],
  hero: HeroDefinition,
  owned: readonly ItemId[],
  definitions: Readonly<Record<ItemId, ItemDefinition>>,
  limits: StatLimits,
  effects: ItemEffectsConfig,
): readonly ItemDefinition[] {
  const loadout = (items: readonly ItemId[]): string =>
    JSON.stringify(computeHeroLoadout(hero, items, definitions, limits, effects));
  const now = loadout(owned);
  const useful = pool.filter((item) => loadout([...owned, item.id]) !== now);
  return useful.length > 0 ? useful : pool;
}
