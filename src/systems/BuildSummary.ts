import type { ItemDefinition, ItemEvolutionConfig, ItemId } from '@/core/lootTypes';
import { ItemKind } from '@/core/lootTypes';

/**
 * „Moje przedmioty” (krok 162, uwaga testera: „brakuje możliwości sprawdzenia, co robiły twoje itemki”):
 * z listy zebranych przedmiotów robi wiersze do pauzy — nazwa z liczbą kopii i co przedmiot robi teraz,
 * z postępem do przemiany (krok 150). Czysta logika — rysuje `scenes/PauseScene.ts`.
 */
export interface BuildRow {
  readonly id: ItemId;
  readonly color: number;
  /** Pierwsza linijka: nazwa (po przemianie — nazwa przemiany) i liczba kopii. */
  readonly title: string;
  /** Druga linijka: co przedmiot robi. */
  readonly detail: string;
  readonly evolved: boolean;
}

/** Wiersze w kolejności pierwszego zdobycia przedmiotu. */
export function summarizeBuild(
  items: readonly ItemId[],
  definitions: Readonly<Record<ItemId, ItemDefinition>>,
  config: ItemEvolutionConfig,
): BuildRow[] {
  const counts = new Map<ItemId, number>();
  for (const id of items) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, copies]) => {
    const item = definitions[id];
    const evolution = config.items[id];
    // Krok 170: relikwia bossa — jedna sztuka.
    if (item.kind === ItemKind.Relic) return { id, color: item.color, title: `◆ ${item.name} (relikwia)`, detail: item.effect, evolved: false };
    // Krok Z3: wotum — opis już mówi, co dają kolejne kopie.
    if (item.kind === ItemKind.Votive) return { id, color: item.color, title: `${item.name} ×${copies} (wotum)`, detail: item.effect, evolved: false };
    // Statystyka rośnie liczbą („+3 obrażeń za kopię”), efekt broni — siłą efektu.
    const base = item.kind === ItemKind.Effect ? (copies > 1 ? `${item.effect}, mocniej z każdą kopią` : item.effect) : `${item.effect} za kopię`;
    if (!evolution) {
      return { id, color: item.color, title: `${item.name} ×${copies}`, detail: base, evolved: false };
    }
    if (copies < config.copies) {
      const left = config.copies - copies;
      return {
        id,
        color: item.color,
        title: `${item.name} ×${copies}`,
        detail: `${base} · jeszcze ${left} do przemiany: ${evolution.name}`,
        evolved: false,
      };
    }
    const maxed = evolution.maxCopies !== undefined && copies >= evolution.maxCopies;
    const more = maxed ? ' · limit kopii' : evolution.after ? ` · kolejna kopia: ${evolution.after}` : '';
    return {
      id,
      color: item.color,
      title: `★ ${evolution.name} (${item.name} ×${copies})`,
      detail: `${evolution.effect}${more}`,
      evolved: true,
    };
  });
}
