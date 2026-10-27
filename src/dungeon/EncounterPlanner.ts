import type { DungeonFloor, IntRange, Room, TilePoint } from '@/core/dungeonTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { EnemyType } from '@/core/combatTypes';
import type { Rng } from '@/core/random';

export interface EncounterConfig {
  readonly enemiesPerRoom: IntRange;
  /** Szansa, że dany przeciwnik będzie dystansowy (Kiter) zamiast Rushera. */
  readonly kiterChance: number;
  /** Gniazdownik (krok 122): szansa na pokój, najkrótszy bok pokoju (kafle) i limit na piętro. */
  readonly nester: NesterPlacement;
  /** Czyhacz (krok 123): rzadszy od Gniazdownika — szansa na pokój, najkrótszy bok i limit na piętro. */
  readonly lurker: NesterPlacement;
}

export interface NesterPlacement {
  readonly roomChance: number;
  readonly minRoomSide: number;
  readonly maxPerFloor: number;
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

/**
 * Gniazdownicy (krok 122): w wylosowanych pokojach pierwszy wróg staje się Gniazdownikiem — liczba wrogów
 * w pokoju się nie zmienia. Tylko w pokojach o boku co najmniej `minRoomSide` (czerwie potrzebują miejsca).
 * Własny strumień RNG: rozmieszczenie i rodzaje pozostałych wrogów zostają jak dotąd.
 */
export function assignNesters(floor: DungeonFloor, spawns: readonly EnemySpawn[], config: NesterPlacement, rng: Rng): EnemySpawn[] {
  const result = [...spawns];
  let placed = 0;
  for (const room of floor.rooms) {
    if (room.kind !== RoomKind.Normal) continue;
    const roll = rng.chance(config.roomChance);
    if (!roll || placed >= config.maxPerFloor || Math.min(room.width, room.height) < config.minRoomSide) continue;
    const index = result.findIndex((s) => s.room === room.id);
    if (index < 0) continue;
    result[index] = { ...result[index]!, type: EnemyType.Nester };
    placed++;
  }
  return result;
}

/**
 * Kryjówki Czyhacza (krok 123): kafle podłogi pod północnym murem pokoju (mur za plecami — trumna oparta o ścianę,
 * pęknięty mur), co najmniej kafel od wejść. Wyskok idzie w głąb pokoju.
 */
export function lurkerDens(floor: DungeonFloor, room: Room): TilePoint[] {
  const doors = findRoomEntrances(floor, room);
  const tileAt = (x: number, y: number) => floor.tiles[y * floor.width + x];
  const dens: TilePoint[] = [];
  for (let x = room.x; x < room.x + room.width; x++) {
    const nearDoor = doors.some((d) => Math.abs(d.x - x) <= 1 && Math.abs(d.y - room.y) <= 1);
    if (!nearDoor && tileAt(x, room.y) === TileType.Floor && tileAt(x, room.y - 1) === TileType.Wall) dens.push({ x, y: room.y });
  }
  return dens;
}

/**
 * Czyhacze (krok 123): w wylosowanych pokojach jeden wróg (nie Gniazdownik; pokój z gniazdem pomijamy) staje się
 * Czyhaczem i przenosi się do kryjówki pod północnym murem. Liczba wrogów w pokoju się nie zmienia.
 * Własny strumień RNG: reszta rozmieszczenia, gniazda i elity zostają jak dotąd.
 */
export function assignLurkers(floor: DungeonFloor, spawns: readonly EnemySpawn[], config: NesterPlacement, rng: Rng): EnemySpawn[] {
  const result = [...spawns];
  let placed = 0;
  for (const room of floor.rooms) {
    if (room.kind !== RoomKind.Normal) continue;
    // Zawsze dwa losowania na pokój — wybór w jednym pokoju nie zależy od reszty piętra.
    const roll = rng.chance(config.roomChance);
    const pick = rng.next();
    if (!roll || placed >= config.maxPerFloor || Math.min(room.width, room.height) < config.minRoomSide) continue;
    if (result.some((s) => s.room === room.id && s.type === EnemyType.Nester)) continue;
    const index = result.findIndex((s) => s.room === room.id);
    const dens = lurkerDens(floor, room);
    if (index < 0 || dens.length === 0) continue;
    result[index] = { ...result[index]!, type: EnemyType.Lurker, tile: dens[Math.floor(pick * dens.length)]! };
    placed++;
  }
  return result;
}
