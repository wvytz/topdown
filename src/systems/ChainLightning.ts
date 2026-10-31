import type { Vector2 } from '@/core/types';

/**
 * Łańcuch pioruna (krok 150, Elektryczna strzała i Iskrownik): z punktu `from` piorun skacze kolejno
 * do najbliższego jeszcze nietrafionego celu w zasięgu `range` od poprzedniego. Czysta logika.
 */
export function chainTargets<T extends Vector2>(from: Vector2, targets: readonly T[], count: number, range: number, exclude: (target: T) => boolean = () => false): T[] {
  const chain: T[] = [];
  const left = targets.filter((target) => !exclude(target));
  let at = from;
  while (chain.length < count) {
    let best: T | null = null;
    let bestDistance = range;
    for (const target of left) {
      if (chain.includes(target)) continue;
      const d = Math.hypot(target.x - at.x, target.y - at.y);
      if (d <= bestDistance) {
        best = target;
        bestDistance = d;
      }
    }
    if (!best) break;
    chain.push(best);
    at = best;
  }
  return chain;
}
