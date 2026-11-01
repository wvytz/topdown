import type { HedgeConfig, RubbleTile } from '@/core/arenaConditionTypes';
import type { AreaStrike, BossAttackPlan, ThrownObject } from '@/core/bossTypes';
import { BossAttackKind } from '@/core/bossTypes';
import type { TilePoint } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';

/**
 * Osłony i przeszkody zmiennych aren (krok 160): walące się mury (A3), lustra odbijające pociski (A2),
 * rosnący żywopłot (B2) i słupy z gniazdami, za którymi klucz bocianów się kończy (B1). Czyste funkcje.
 */

const key = (t: TilePoint): string => `${t.x},${t.y}`;

/** Kafle gruzu, które walą się, gdy walka wchodzi w fazę `phase` (wszystkie fazy do niej włącznie). */
export function rubbleForPhase(rubble: readonly RubbleTile[], phase: number): RubbleTile[] {
  return rubble.filter((tile) => tile.phase <= phase);
}

/**
 * Kolejność walenia się muru: od kafla najbliższego środka areny falą na zewnątrz (`rippleMs` między kaflami).
 * Zwraca opóźnienie każdego kafla.
 */
export function collapseOrder(tiles: readonly TilePoint[], center: Vector2, rippleMs: number): Array<{ readonly tile: TilePoint; readonly delayMs: number }> {
  return [...tiles]
    .sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
    .map((tile, i) => ({ tile, delayMs: i * rippleMs }));
}

/** Wyjście z lustra: pierwszy wolny kafel obok drugiego lustra (najpierw przed nim — od strony kamery). */
export function mirrorExit(mirror: TilePoint, isFree: (tile: TilePoint) => boolean): TilePoint | null {
  const order: TilePoint[] = [
    { x: mirror.x, y: mirror.y + 1 },
    { x: mirror.x - 1, y: mirror.y },
    { x: mirror.x + 1, y: mirror.y },
    { x: mirror.x, y: mirror.y - 1 },
  ];
  return order.find(isFree) ?? null;
}

/**
 * Czy po zablokowaniu kafli `blocked` z każdego z `from` da się dojść do `to` (BFS po wolnych kaflach,
 * `isOpen` — wolny kafel areny). Żywopłot nigdy nie odcina bohatera od bossa ani bohaterów od siebie.
 */
export function keepsReachable(from: readonly TilePoint[], to: TilePoint, blocked: readonly TilePoint[], isOpen: (tile: TilePoint) => boolean, maxNodes = 2000): boolean {
  const wall = new Set(blocked.map(key));
  const open = (t: TilePoint): boolean => !wall.has(key(t)) && isOpen(t);
  if (!open(to)) return false;
  const seen = new Set<string>([key(to)]);
  const queue: TilePoint[] = [to];
  while (queue.length > 0 && seen.size <= maxNodes) {
    const t = queue.shift()!;
    for (const n of [
      { x: t.x + 1, y: t.y },
      { x: t.x - 1, y: t.y },
      { x: t.x, y: t.y + 1 },
      { x: t.x, y: t.y - 1 },
    ]) {
      if (seen.has(key(n)) || !open(n)) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return from.every((t) => seen.has(key(t)));
}

/**
 * Odcinek żywopłotu długości `lengthTiles` (krok 160, B2). Kolejność prób: w poprzek drogi wiedźma → bohater
 * w połowie drogi (zasłania), za plecami bohatera (odcina odwrót — zaułek pod bocianami), wzdłuż drogi z boku
 * bohatera (ściana uliczki). Każdy kafel musi być wolny (`isFree`), a żywopłot nie może odciąć bohatera od
 * wiedźmy (`keepsReachable`). Brak miejsca — null. Wiedźma walczy z ok. 3–4 kafli, więc środek drogi często
 * leży za blisko ciał i wtedy wygrywają dalsze propozycje.
 */
export function planHedge(
  witch: TilePoint,
  heroes: readonly TilePoint[],
  target: TilePoint,
  config: HedgeConfig,
  isFree: (tile: TilePoint) => boolean,
  isOpen: (tile: TilePoint) => boolean,
): TilePoint[] | null {
  const dx = target.x - witch.x;
  const dy = target.y - witch.y;
  if (dx === 0 && dy === 0) return null;
  const horizontalPath = Math.abs(dx) >= Math.abs(dy);
  const along = horizontalPath ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
  const across = { x: -along.y, y: along.x };
  const mid = { x: Math.round((witch.x + target.x) / 2), y: Math.round((witch.y + target.y) / 2) };
  const half = Math.floor((config.lengthTiles - 1) / 2);
  const line = (base: TilePoint, dir: TilePoint): TilePoint[] => {
    const tiles: TilePoint[] = [];
    for (let i = -half; i < config.lengthTiles - half; i++) tiles.push({ x: base.x + dir.x * i, y: base.y + dir.y * i });
    return tiles;
  };
  const at = (base: TilePoint, dir: TilePoint, k: number): TilePoint => ({ x: base.x + dir.x * k, y: base.y + dir.y * k });
  const candidates: TilePoint[][] = [
    line(mid, across),
    line(at(mid, along, -1), across),
    line(at(mid, along, 1), across),
    line(at(target, along, 2), across),
    line(at(target, along, 3), across),
    line(at(target, across, 2), along),
    line(at(target, across, -2), along),
  ];
  for (const tiles of candidates) {
    if (!tiles.every(isFree)) continue;
    if (!keepsReachable([...heroes], witch, tiles, isOpen)) continue;
    return tiles;
  }
  return null;
}

/** Kafel pod punktem (px). */
export function tileOf(point: Vector2, tileSize: number): TilePoint {
  return { x: Math.floor(point.x / tileSize), y: Math.floor(point.y / tileSize) };
}

/** Czy punkt leży na którymś z kafli `tiles` (z zapasem `padPx` w każdą stronę). */
function onTiles(point: Vector2, tiles: readonly TilePoint[], tileSize: number, padPx: number): boolean {
  return tiles.some(
    (t) => point.x >= t.x * tileSize - padPx && point.x < (t.x + 1) * tileSize + padPx && point.y >= t.y * tileSize - padPx && point.y < (t.y + 1) * tileSize + padPx,
  );
}

/**
 * Klucz bocianów przy słupach z gniazdami (krok 160, B1): zostaje `lanes` pasów najbliższych pasowi przez bohatera
 * (każde stojące gniazdo to jeden bocian więcej), a pas kończy się na słupie — bocian nie przeleci przez kamień,
 * więc za słupem jest osłona. Inne ataki bez zmian.
 */
export function adjustStorkFlight(plan: BossAttackPlan, lanes: number, pillars: readonly TilePoint[], tileSize: number): BossAttackPlan {
  if (plan.kind !== BossAttackKind.StorkFlight) return plan;
  const storks = plan.throws.filter((t) => t.look === 'stork');
  const total = storks.length;
  if (total === 0 || plan.strikes.length % total !== 0) return plan;
  const perLane = plan.strikes.length / total;
  const middle = Math.floor((total - 1) / 2);
  const keep = new Set(
    Array.from({ length: total }, (_, i) => i)
      .sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b)
      .slice(0, Math.max(1, Math.min(total, lanes))),
  );
  const strikes: AreaStrike[] = [];
  const throws: ThrownObject[] = plan.throws.filter((t) => t.look !== 'stork');
  for (let lane = 0; lane < total; lane++) {
    if (!keep.has(lane)) continue;
    const laneStrikes = plan.strikes.slice(lane * perLane, (lane + 1) * perLane);
    const stork = storks[lane]!;
    const blockedAt = laneStrikes.findIndex((s) => onTiles(s.center, pillars, tileSize, s.radius * 0.5));
    if (blockedAt < 0) {
      strikes.push(...laneStrikes);
      throws.push(stork);
      continue;
    }
    strikes.push(...laneStrikes.slice(0, blockedAt));
    const stop = laneStrikes[blockedAt]!;
    throws.push({ ...stork, to: stop.center, landAt: stop.impactAt });
  }
  return { ...plan, strikes, throws };
}
