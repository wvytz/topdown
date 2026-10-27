/** Gniazdownik (krok 122): ile stworków wypluć, gdzie i czyje są — czysta logika, bez Phasera. */
import type { BroodAttackDefinition } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { directionTo } from '@/systems/CombatMath';

/** Ile stworków gniazdo wypluje teraz: wylęg ograniczony limitem żywych i zapasem na całe życie. */
export function broodCapacity(attack: BroodAttackDefinition, alive: number, spawned: number): number {
  return Math.max(0, Math.min(attack.count, attack.maxAlive - alive, attack.total - spawned));
}

/**
 * Miejsca wylęgu: `n` punktów na łuku `spawnDistance` od gniazda, wachlarzem `spreadDeg` w stronę celu
 * (stworki wypadają przed gniazdo, a nie za ścianę za jego plecami). Cel w środku gniazda — wachlarz na południe.
 */
export function broodSpawnPoints(origin: Vector2, target: Vector2, n: number, attack: BroodAttackDefinition): Vector2[] {
  if (n <= 0) return [];
  const dir = directionTo(origin, target);
  const base = dir.x === 0 && dir.y === 0 ? Math.PI / 2 : Math.atan2(dir.y, dir.x);
  const spread = (attack.spreadDeg * Math.PI) / 180;
  return Array.from({ length: n }, (_, i) => {
    const angle = n === 1 ? base : base - spread / 2 + (spread * i) / (n - 1);
    return { x: origin.x + Math.cos(angle) * attack.spawnDistance, y: origin.y + Math.sin(angle) * attack.spawnDistance };
  });
}

/**
 * Kto kogo wykluł. Gniazdo liczy żywe stworki (limit) i wszystkie wyplute (zapas);
 * po śmierci gniazda jego stworki giną razem z nim (`release`).
 */
export class BroodLedger<Nest extends object, Minion extends object> {
  private readonly broods = new Map<Nest, Set<Minion>>();
  private readonly spawned = new Map<Nest, number>();
  private readonly parents = new Map<Minion, Nest>();

  /** Żywe stworki gniazda. */
  aliveOf(nest: Nest): number {
    return this.broods.get(nest)?.size ?? 0;
  }

  /** Ile stworków gniazdo wypluło od początku. */
  spawnedBy(nest: Nest): number {
    return this.spawned.get(nest) ?? 0;
  }

  isMinion(minion: Minion): boolean {
    return this.parents.has(minion);
  }

  add(nest: Nest, minion: Minion): void {
    const brood = this.broods.get(nest) ?? new Set<Minion>();
    brood.add(minion);
    this.broods.set(nest, brood);
    this.spawned.set(nest, this.spawnedBy(nest) + 1);
    this.parents.set(minion, nest);
  }

  /** Stworek zginął — zwalnia miejsce w limicie gniazda (zapasu nie oddaje). */
  remove(minion: Minion): void {
    const nest = this.parents.get(minion);
    if (nest === undefined) return;
    this.parents.delete(minion);
    this.broods.get(nest)?.delete(minion);
  }

  /**
   * Gniazdo zginęło: zwraca jego żywe stworki (do uśmiercenia) i zapomina gniazdo. Stworki zostają oznaczone
   * jako stworki (bez łupu) aż do `remove` przy ich śmierci.
   */
  release(nest: Nest): Minion[] {
    const brood = [...(this.broods.get(nest) ?? [])];
    this.broods.delete(nest);
    this.spawned.delete(nest);
    return brood;
  }
}
