import type { ItemId, RunSnapshot } from '@/core/lootTypes';
import { HeroId } from '@/core/heroTypes';
import { RunMode } from '@/core/runMode';

export const NEW_RUN: RunSnapshot = { hero: HeroId.Barbarian, gold: 0, items: [], hp: null, practice: false };

/** Nowy run wybranym bohaterem; `practice` = run testowy z adresu (wynik nie trafia na tablicę); `mode` — tryb gry (krok 90). */
export const newRun = (hero: HeroId, practice = false, mode = RunMode.Tower): RunSnapshot =>
  mode === RunMode.Tower ? { ...NEW_RUN, hero, practice } : { ...NEW_RUN, hero, practice, mode };

/** Postęp runu (złoto, przedmioty) — żyje przez jedno piętro, przenoszony jako RunSnapshot. */
export class RunState {
  readonly hero: HeroId;
  readonly practice: boolean;
  readonly mode: RunMode;
  private goldAmount: number;
  private readonly itemIds: ItemId[];

  constructor(snapshot: RunSnapshot) {
    this.hero = snapshot.hero;
    this.practice = snapshot.practice ?? false;
    this.mode = snapshot.mode ?? RunMode.Tower;
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
    const base = { hero: this.hero, gold: this.goldAmount, items: [...this.itemIds], hp, practice: this.practice };
    return this.mode === RunMode.Tower ? base : { ...base, mode: this.mode };
  }
}
