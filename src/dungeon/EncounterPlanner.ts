import type { DungeonFloor, IntRange, TilePoint } from '@/core/dungeonTypes';
import { RoomKind } from '@/core/dungeonTypes';
import { EnemyType } from '@/core/combatTypes';
import type { Rng } from '@/core/random';

export interface EncounterConfig {
  readonly enemiesPerRoom: IntRange;
  /** Szansa, że dany przeciwnik będzie dystansowy (Kiter) zamiast Rushera. */
  readonly kiterChance: number;
}

export interface EnemySpawn {
  readonly type: EnemyType;
  readonly tile: TilePoint;
  /** Pokój spawnu (id) — elity losujemy po jednej na pokój (krok 42). */
  readonly room: number;
}

/**
 * Rozmieszcza przeciwników w zwykłych pokojach. Pokój startowy jest bezpieczny,
 * a komnata bossa czeka na bossa (osobny etap).
 */
export function planEncounters(floor: DungeonFloor, config: EncounterConfig, rng: Rng): EnemySpawn[] {
  const spawns: EnemySpawn[] = [];

  for (const room of floor.rooms) {
    if (room.kind !== RoomKind.Normal) continue;

    const count = rng.int(config.enemiesPerRoom.min, config.enemiesPerRoom.max);
    const used = new Set<string>();
    // Margines 1 kafla od ścian, żeby przeciwnik nie utknął przy krawędzi.
    for (let i = 0, guard = 0; i < count && guard < count * 10; guard++) {
      const tile: TilePoint = {
        x: rng.int(room.x + 1, room.x + room.width - 2),
        y: rng.int(room.y + 1, room.y + room.height - 2),
      };
      const key = `${tile.x},${tile.y}`;
      if (used.has(key)) continue;
      used.add(key);
      spawns.push({ type: rng.chance(config.kiterChance) ? EnemyType.Kiter : EnemyType.Rusher, tile, room: room.id });
      i++;
    }
  }
  return spawns;
}
