import type { RetinueDefinition } from '@/core/bossTypes';
import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';

/**
 * Świta bossa (krok 80): rytm wezwań. Pierwsze `firstAfterMs` po rozpoczęciu walki, kolejne co `everyMs`
 * (po wściekłości `enragedEveryMs`). Wezwanie w chwili, gdy limit żywych jest pełny, przepada — następne
 * przychodzi zgodnie z rytmem (gracz, który szybko czyści świtę, nie dostaje jej więcej).
 */
export class RetinueSchedule {
  private nextAt = Infinity;

  constructor(private readonly definition: RetinueDefinition) {}

  get isActive(): boolean {
    return Number.isFinite(this.nextAt);
  }

  activate(now: number): void {
    if (!this.isActive) this.nextAt = now + this.definition.firstAfterMs;
  }

  /** Ilu pomocników wezwać teraz; 0 = jeszcze nie pora albo limit żywych pełny. */
  due(now: number, alive: number, enraged: boolean): number {
    if (now < this.nextAt) return 0;
    const def = this.definition;
    this.nextAt = now + (enraged ? def.enragedEveryMs : def.everyMs);
    return Math.max(0, Math.min(def.maxAlive - alive, def.count + (enraged ? 1 : 0)));
  }
}

/**
 * Miejsca wyjścia świty: kafle podłogi areny (z kaflem odstępu od muru), co najmniej `minPlayerDistance`
 * kafli od gracza i 2 kafle od siebie; kolejność losowa z własnego strumienia RNG. Może zwrócić mniej niż `count`.
 */
export function pickRetinueTiles(
  floor: Pick<DungeonFloor, 'width' | 'tiles'>,
  arena: Room,
  player: TilePoint,
  count: number,
  minPlayerDistance: number,
  rng: Rng,
): TilePoint[] {
  const candidates: TilePoint[] = [];
  for (let y = arena.y + 1; y < arena.y + arena.height - 1; y++) {
    for (let x = arena.x + 1; x < arena.x + arena.width - 1; x++) {
      if (floor.tiles[y * floor.width + x] !== TileType.Floor) continue;
      if (chebyshev({ x, y }, player) < minPlayerDistance) continue;
      candidates.push({ x, y });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  const chosen: TilePoint[] = [];
  for (const tile of candidates) {
    if (chosen.length >= count) break;
    if (chosen.some((other) => chebyshev(tile, other) < 2)) continue;
    chosen.push(tile);
  }
  return chosen;
}

function chebyshev(a: TilePoint, b: TilePoint): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
