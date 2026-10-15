import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import type { FeastDefinition } from '@/core/bossTypes';

/**
 * Spiżarnia Grzybowego Pożeracza (krok 33): kokony z zarażonymi na podłodze areny, przy ścianach
 * (`wallMarginTiles` od muru), z dala od środka (tam staje boss i schody) i od siebie nawzajem.
 * Kolejność kandydatów losowa (własny strumień RNG), wybór zachłanny z odstępem.
 * Krok 34: kokony nie stoją przy tronie Pożeracza (`throne`) — w promieniu `throneClear` kafli (Czebyszew).
 */
export function planLarders(
  floor: DungeonFloor,
  arena: Room,
  config: FeastDefinition['larders'],
  rng: Rng,
  throne: TilePoint | null = null,
  throneClear = 0,
): TilePoint[] {
  const m = config.wallMarginTiles;
  const center = { x: arena.x + Math.floor(arena.width / 2), y: arena.y + Math.floor(arena.height / 2) };
  const candidates: TilePoint[] = [];
  for (let y = arena.y + m; y <= arena.y + arena.height - 1 - m; y++) {
    for (let x = arena.x + m; x <= arena.x + arena.width - 1 - m; x++) {
      const ring = x === arena.x + m || x === arena.x + arena.width - 1 - m || y === arena.y + m || y === arena.y + arena.height - 1 - m;
      if (!ring || floor.tiles[y * floor.width + x] !== TileType.Floor) continue;
      if (chebyshev({ x, y }, center) <= config.centerClearTiles) continue;
      if (throne && chebyshev({ x, y }, throne) <= throneClear) continue;
      candidates.push({ x, y });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  const count = rng.int(config.count.min, config.count.max);
  const chosen: TilePoint[] = [];
  for (const tile of candidates) {
    if (chosen.length >= count) break;
    if (chosen.some((other) => chebyshev(tile, other) < config.minSpacingTiles)) continue;
    chosen.push(tile);
  }
  return chosen;
}

function chebyshev(a: TilePoint, b: TilePoint): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
