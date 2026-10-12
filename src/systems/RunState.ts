import type { ItemId, RunSnapshot } from '@/core/lootTypes';

export const NEW_RUN: RunSnapshot = { gold: 0, items: [], hp: null };

/** Postęp runu (złoto, przedmioty) — żyje przez jedno piętro, przenoszony jako RunSnapshot. */
export class RunState {
  private goldAmount: number;
  private readonly itemIds: ItemId[];

  constructor(snapshot: RunSnapshot) {
    this.goldAmount = snapshot.gold;
    this.itemIds = [...snapshot.items];
  }

  get gold(): number {
    return this.goldAmount;
  }

  get items(): readonly ItemId[] {
    return this.itemIds;
  }

  addGold(amount: number): void {
    this.goldAmount += Math.max(0, Math.floor(amount));
  }

  /** Odejmuje złoto, jeśli wystarcza. Zwraca false (bez zmian), gdy brakuje. */
  spendGold(amount: number): boolean {
    const cost = Math.max(0, Math.floor(amount));
    if (cost > this.goldAmount) return false;
    this.goldAmount -= cost;
    return true;
  }

  addItem(id: ItemId): void {
    this.itemIds.push(id);
  }

  /** Liczba sztuk każdego przedmiotu, w kolejności pierwszego zdobycia. */
  itemCounts(): Array<{ id: ItemId; count: number }> {
    const counts = new Map<ItemId, number>();
    for (const id of this.itemIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts].map(([id, count]) => ({ id, count }));
  }

  snapshot(hp: number | null): RunSnapshot {
    return { gold: this.goldAmount, items: [...this.itemIds], hp };
  }
}
