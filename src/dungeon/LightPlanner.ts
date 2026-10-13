import type { DungeonFloor } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import type { TorchPlacementConfig } from '@/config/lightingConfig';

/** Pochodnia na licu muru: kafel ściany nad pokojem (lico zwrócone na południe, do pokoju). */
export interface TorchSpot {
  readonly x: number;
  readonly y: number;
  readonly roomId: number;
}

/**
 * Rozmieszcza pochodnie: tylko na prostych odcinkach górnej ściany pokoju (mur z każdej strony
 * poza południem, pod spodem zwykła podłoga), z minimalnym odstępem i limitem na pokój.
 * Czysta funkcja z własnym strumieniem RNG — czysto wizualna, nie zmienia zasad gry.
 */
export function planTorches(floor: DungeonFloor, config: TorchPlacementConfig, seed: number): TorchSpot[] {
  const rng = createRng(seed);
  const wall = (x: number, y: number) =>
    x < 0 || y < 0 || x >= floor.width || y >= floor.height || floor.tiles[y * floor.width + x] === TileType.Wall;
  const plainFloor = (x: number, y: number) => !wall(x, y) && floor.tiles[y * floor.width + x] === TileType.Floor;
  const chosen: TorchSpot[] = [];

  for (const room of floor.rooms) {
    const y = room.y - 1;
    const candidates: number[] = [];
    for (let x = room.x; x < room.x + room.width; x++) {
      if (wall(x, y) && wall(x, y - 1) && wall(x - 1, y) && wall(x + 1, y) && plainFloor(x, y + 1)) candidates.push(x);
    }
    // Tasowanie Fishera–Yatesa, potem zachłanny wybór z zachowaniem odstępu.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
    }
    const limit = room.kind === RoomKind.Boss ? config.maxPerBossRoom : config.maxPerRoom;
    let placed = 0;
    for (const x of candidates) {
      if (placed >= limit) break;
      const tooClose = chosen.some((t) => Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) < config.minSpacing);
      if (tooClose) continue;
      chosen.push({ x, y, roomId: room.id });
      placed++;
    }
  }
  return chosen;
}
