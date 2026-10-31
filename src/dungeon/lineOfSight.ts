import type { DungeonFloor } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';

/**
 * Czy odcinek między dwoma punktami (w px) nie przecina ściany.
 * Próbkujemy co 1/4 kafla — wystarczająco dokładnie przy naszych prędkościach i rozmiarach.
 */
export function hasLineOfSight(floor: Pick<DungeonFloor, 'width' | 'height' | 'tiles'>, from: Vector2, to: Vector2, tileSize: number): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (tileSize / 4)));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const tx = Math.floor((from.x + dx * t) / tileSize);
    const ty = Math.floor((from.y + dy * t) / tileSize);
    if (tx < 0 || ty < 0 || tx >= floor.width || ty >= floor.height) return false;
    if (floor.tiles[ty * floor.width + tx] === TileType.Wall) return false;
  }
  return true;
}
