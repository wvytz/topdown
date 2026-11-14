import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';

/** Naklejki sali tronowej — kolejność kolumn arkusza `throne-decals.png`. */
export enum ThroneDecalKind {
  BloodPool = 0,
  Splatter = 1,
  DragTrail = 2,
  Mycelium = 3,
  SapPuddle = 4,
  Grate = 5,
}

export interface ThroneDecal {
  readonly kind: ThroneDecalKind;
  readonly tile: TilePoint;
}

export interface ThroneDecalConfig {
  readonly count: { readonly min: number; readonly max: number };
  readonly weights: readonly number[];
  readonly minSpacingTiles: number;
  readonly centerClearTiles: number;
}

/**
 * Naklejki krwi, grzybni i soku na podłodze areny: losowe kafle podłogi (własny strumień RNG), z odstępem,
 * poza środkiem areny (schody). Rodzaj losowany z wag. Sam tron usunięty w kroku U4b (decyzja właściciela).
 */
export function planThroneDecals(
  floor: DungeonFloor,
  arena: Room,
  config: ThroneDecalConfig,
  rng: Rng,
): ThroneDecal[] {
  const center = { x: arena.x + Math.floor(arena.width / 2), y: arena.y + Math.floor(arena.height / 2) };
  const candidates: TilePoint[] = [];
  for (let y = arena.y; y < arena.y + arena.height; y++) {
    for (let x = arena.x; x < arena.x + arena.width; x++) {
      const tile = { x, y };
      if (floor.tiles[y * floor.width + x] !== TileType.Floor) continue;
      if (chebyshev(tile, center) <= config.centerClearTiles) continue;
      candidates.push(tile);
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  const count = rng.int(config.count.min, config.count.max);
  const decals: ThroneDecal[] = [];
  for (const tile of candidates) {
    if (decals.length >= count) break;
    if (decals.some((other) => chebyshev(tile, other.tile) < config.minSpacingTiles)) continue;
    decals.push({ kind: pickWeighted(config.weights, rng), tile });
  }
  return decals;
}

function pickWeighted(weights: readonly number[], rng: Rng): ThroneDecalKind {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return i as ThroneDecalKind;
  }
  return (weights.length - 1) as ThroneDecalKind;
}

export function chebyshev(a: TilePoint, b: TilePoint): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
