import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { Rng } from '@/core/random';
import { findRoomEntrances } from '@/dungeon/arenaGates';

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
 * Tron Grzybowego Pożeracza (krok 34): środek bloku 3×3 kafli, oparciem do północnej ściany areny
 * (górny rząd bloku to pierwszy rząd areny). Najbliżej osi areny, na samej podłodze i z dala od wejść
 * w północnej ścianie (`entranceClear` kafli od osi). Brak miejsca = null (sala bez tronu).
 */
export function planThrone(floor: DungeonFloor, arena: Room, entranceClear: number): TilePoint | null {
  const y = arena.y + 1;
  const centerX = arena.x + Math.floor(arena.width / 2);
  const northEntrances = findRoomEntrances(floor, arena).filter((tile) => tile.y === arena.y - 1);
  const xs: number[] = [];
  for (let x = arena.x + 1; x <= arena.x + arena.width - 2; x++) xs.push(x);
  xs.sort((a, b) => Math.abs(a - centerX) - Math.abs(b - centerX) || a - b);
  for (const x of xs) {
    if (northEntrances.some((tile) => Math.abs(tile.x - x) <= entranceClear)) continue;
    if (!blockIsFloor(floor, x, y)) continue;
    return { x, y };
  }
  return null;
}

/**
 * Naklejki krwi, grzybni i soku na podłodze areny: losowe kafle podłogi (własny strumień RNG), z odstępem,
 * poza środkiem areny (schody) i poza blokiem tronu. Rodzaj losowany z wag.
 */
export function planThroneDecals(
  floor: DungeonFloor,
  arena: Room,
  throne: TilePoint | null,
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
      if (throne && chebyshev(tile, throne) <= 1) continue;
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

function blockIsFloor(floor: DungeonFloor, cx: number, cy: number): boolean {
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (floor.tiles[y * floor.width + x] !== TileType.Floor) return false;
    }
  }
  return true;
}

export function chebyshev(a: TilePoint, b: TilePoint): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
