import type { HeroDefinition, HeroId } from '@/core/heroTypes';

/** Indeks karty po przesunięciu o `delta` (strzałki); zawija się na końcach. */
export function cycleIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

/** Karta zaznaczona na starcie: ostatnio wybrany bohater, a gdy go nie ma w kolejności — pierwsza. */
export function initialIndex(order: readonly HeroId[], preselect: HeroId | null): number {
  const index = preselect === null ? -1 : order.indexOf(preselect);
  return Math.max(0, index);
}

/** Linia statystyk na karcie: życie i chód. */
export function heroStatLine(hero: HeroDefinition): string {
  return `ŻYCIE ${hero.stats.maxHp} · CHÓD ${hero.stats.moveSpeed}`;
}
