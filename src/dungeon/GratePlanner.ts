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


/** Rekwizyty kotłowni Palacza (krok 182a): kafle stołów (lewy z dwóch), stert węgla i łańcuchów na licu północnego muru. */
export interface StokerProps {
  readonly tables: readonly TilePoint[];
  readonly coalHeaps: readonly TilePoint[];
  readonly chains: readonly TilePoint[];
}

/**
 * Rekwizyty kotłowni (bez kolizji — tylko wygląd): sterty węgla w pierwszym rzędzie po obu stronach paszczy pieca,
 * stoły do krojenia (2 kafle) w najniższym kamiennym pasie przy bocznych murach, łańcuchy z kajdanami na licu
 * północnego muru z dala od paszczy. Nic bliżej niż `entranceClear` od wejścia ani na kaflach rusztów.
 */
export function planStokerProps(
  floor: DungeonFloor,
  arena: Room,
  rows: readonly GrateTileRow[],
  props: NonNullable<ArenaGratesDefinition['props']>,
): StokerProps {
  const entrances = findRoomEntrances(floor, arena);
  const center = arena.x + Math.floor(arena.width / 2);
  const middle = arena.y + Math.floor(arena.height / 2);
  const grate = new Set(rows.flatMap((r) => r.tiles.map((t) => `${t.x},${t.y}`)));
  const free = (t: TilePoint) =>
    floor.tiles[t.y * floor.width + t.x] === TileType.Floor &&
    !grate.has(`${t.x},${t.y}`) &&
    entrances.every((e) => Math.max(Math.abs(e.x - t.x), Math.abs(e.y - t.y)) > props.entranceClear);
  const pair = (t: TilePoint) => free(t) && free({ x: t.x + 1, y: t.y });

  const top = arena.y;
  const bottom = arena.y + arena.height - 1;
  const left = arena.x + 1;
  const right = arena.x + arena.width - 3;
  // Sterty: przy paszczy pieca, potem w dolnych narożnikach.
  const heapSpots = [
    { x: center - props.furnaceClear - 2, y: top },
    { x: center + props.furnaceClear, y: top },
    { x: left, y: bottom },
    { x: right, y: bottom },
  ];
  const coalHeaps = heapSpots.filter(pair).slice(0, props.coalHeaps);

  // Stoły: na kamiennych pasach między rusztami przy bocznych murach, od dołu areny (z dala od pieca).
  const grateYs = new Set(rows.map((r) => r.tiles[0]!.y));
  const taken = new Set(coalHeaps.flatMap((t) => [`${t.x},${t.y}`, `${t.x + 1},${t.y}`]));
  const tables: TilePoint[] = [];
  for (let y = bottom - 1; y > top && tables.length < props.tables; y--) {
    if (grateYs.has(y) || y === middle) continue;
    for (const x of [left, right]) {
      const t = { x, y };
      const crowded = tables.some((o) => o.x === x && Math.abs(o.y - y) < 2) || [...taken].some((k) => k === `${x},${y + 1}` || k === `${x},${y - 1}`);
      if (tables.length < props.tables && pair(t) && !crowded && !taken.has(`${x},${y}`) && !taken.has(`${x + 1},${y}`)) tables.push(t);
    }
  }

  const chains: TilePoint[] = [];
  for (let x = arena.x + 1; x < arena.x + arena.width - 1; x += props.chainEvery) {
    if (Math.abs(x - center) <= props.furnaceClear) continue;
    if (entrances.some((e) => e.y < arena.y && Math.abs(e.x - x) <= props.entranceClear)) continue;
    chains.push({ x, y: arena.y - 1 });
  }
  return { tables, coalHeaps, chains };
}
