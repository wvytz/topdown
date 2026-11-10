import type { ArenaGratesDefinition } from '@/core/bossTypes';
import type { DungeonFloor, Room, TilePoint } from '@/core/dungeonTypes';
import { TileType } from '@/core/dungeonTypes';
import { findRoomEntrances } from '@/dungeon/arenaGates';

/** Rząd rusztu w kaflach: zestaw (0/1) i kafle od zachodu na wschód. */
export interface GrateTileRow {
  readonly set: 0 | 1;
  readonly tiles: readonly TilePoint[];
}

/**
 * Ruszty w posadzce areny Palacza (krok 182): poziome pasy kafli co `rowEvery` rzędów od `firstRow`, z `wallMargin`
 * kaflami wolnej posadzki przy bocznych murach (obejście pasa) i bez środkowego rzędu areny (start bossa, schody).
 * Kafle bliżej niż `doorClear` od wejścia (otwór w murze areny) zostają gołą posadzką. Rzędy na przemian w zestawie 0 i 1.
 */
export function planArenaGrates(floor: DungeonFloor, arena: Room, layout: ArenaGratesDefinition): GrateTileRow[] {
  const doors = findRoomEntrances(floor, arena);
  const middle = arena.y + Math.floor(arena.height / 2);
  const rows: GrateTileRow[] = [];
  for (let dy = layout.firstRow; dy < arena.height - 1; dy += layout.rowEvery) {
    const y = arena.y + dy;
    if (y === middle) continue;
    const tiles: TilePoint[] = [];
    for (let x = arena.x + layout.wallMargin; x < arena.x + arena.width - layout.wallMargin; x++) {
      if (floor.tiles[y * floor.width + x] !== TileType.Floor) continue;
      if (doors.some((d) => Math.max(Math.abs(d.x - x), Math.abs(d.y - y)) <= layout.doorClear)) continue;
      tiles.push({ x, y });
    }
    if (tiles.length > 0) rows.push({ set: (rows.length % 2) as 0 | 1, tiles });
  }
  return rows;
}

