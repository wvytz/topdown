import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';

/** Punkt, od którego boss musi stanąć co najmniej `minTiles` kafli (gracz, wejście areny, drugi boss duetu). */
export interface SpawnKeepOut {
  readonly at: Vector2;
  readonly minTiles: number;
}

/**
 * Miejsce startu bossa (uwaga testera, krok 131: bossowie pojawiali się bohaterowi na twarzy). Wszystko w kaflach
 * (współrzędne ułamkowe, środek kafla = x + 0,5). Gdy wymarzone miejsce (środek areny, w duecie — bok środka)
 * trzyma odstęp od wszystkich punktów, zostaje bez zmian. W przeciwnym razie boss staje na najbliższym mu środku
 * kafla areny, który odstęp trzyma; gdy takiego nie ma — tam, gdzie odstępów brakuje najmniej.
 * Ciało (`bodyRadiusTiles`) mieści się na arenie, nie wchodzi w mur; kafel muru nie jest kandydatem.
 */
export function planBossSpawn(
  floor: Pick<DungeonFloor, 'width' | 'tiles'>,
  arena: Room,
  desired: Vector2,
  keepOut: readonly SpawnKeepOut[],
  bodyRadiusTiles: number,
): Vector2 {
  if (shortfall(desired, keepOut) === 0) return desired;
  let best: { at: Vector2; shortfall: number; drift: number } | null = null;
  for (let y = arena.y; y < arena.y + arena.height; y++) {
    for (let x = arena.x; x < arena.x + arena.width; x++) {
      if (floor.tiles[y * floor.width + x] === TileType.Wall) continue;
      const at = { x: x + 0.5, y: y + 0.5 };
      if (!bodyFits(arena, at, bodyRadiusTiles)) continue;
      const candidate = { at, shortfall: shortfall(at, keepOut), drift: distance(at, desired) };
      if (!best || candidate.shortfall < best.shortfall || (candidate.shortfall === best.shortfall && candidate.drift < best.drift)) {
        best = candidate;
      }
    }
  }
  return best?.at ?? desired;
}

/** Punkty, od których boss trzyma odstęp: wejścia areny (środki kafli) i bohaterowie (już w kaflach). */
export function spawnKeepOuts(
  entrances: readonly TilePoint[],
  heroes: readonly Vector2[],
  config: { readonly minEntranceDistanceTiles: number; readonly minPlayerDistanceTiles: number },
): SpawnKeepOut[] {
  return [
    ...entrances.map((tile) => ({ at: { x: tile.x + 0.5, y: tile.y + 0.5 }, minTiles: config.minEntranceDistanceTiles })),
    ...heroes.map((at) => ({ at, minTiles: config.minPlayerDistanceTiles })),
  ];
}

/** Suma brakujących kafli odstępu (0 = wszystkie odstępy zachowane). */
function shortfall(at: Vector2, keepOut: readonly SpawnKeepOut[]): number {
  return keepOut.reduce((sum, point) => sum + Math.max(0, point.minTiles - distance(at, point.at)), 0);
}

function bodyFits(arena: Room, at: Vector2, radius: number): boolean {
  return at.x - arena.x >= radius && arena.x + arena.width - at.x >= radius && at.y - arena.y >= radius && arena.y + arena.height - at.y >= radius;
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
