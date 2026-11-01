import type { ConditionRhythm, WetFloorConfig } from '@/core/arenaConditionTypes';
import type { Vector2 } from '@/core/types';

/**
 * Mokra posadzka Lustrzanej komnaty (krok 160, A1 „Uwaga, ślisko!”): sprzątaczki myją arenę pasami, a przewrócone
 * wiadro rozlewa kałużę. Mokre = poślizg dla wszystkich; szarżująca sprzątaczka na mokrym wpada w poślizg.
 * Czyste funkcje — warstwa Phasera rysuje dokładnie to, co tu liczy się jako mokre.
 */

/** Prostokąt w px. */
export interface PxRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Pas mytej posadzki: mop jedzie od `fromLeft` (true — od lewej) przez `sweepMs`, potem pas schnie. */
export interface WetLane extends PxRect {
  readonly startAt: number;
  readonly sweepMs: number;
  readonly fromLeft: boolean;
  /** Do kiedy pas ślizga (potem tylko schnie na obrazie). */
  readonly wetUntil: number;
  /** Do kiedy pas widać (schnięcie). */
  readonly goneAt: number;
}

/** Kałuża z przewróconego wiadra. */
export interface WetPuddle {
  readonly center: Vector2;
  readonly radius: number;
  readonly until: number;
}

/** Odstęp do kolejnego zdarzenia: spokojnie albo we wściekłości. */
export function rhythmDelay(rhythm: ConditionRhythm, enraged: boolean): number {
  return enraged ? rhythm.enragedMs : rhythm.calmMs;
}

/**
 * Nowy pas w rzędzie bohatera (`aimY`, px): `laneTiles` kafli wysokości, cała szerokość areny, przyciśnięty do jej
 * wnętrza. `fromLeft` — z której strony jedzie mop.
 */
export function planWetLane(arena: PxRect, aimY: number, tileSize: number, now: number, fromLeft: boolean, config: WetFloorConfig): WetLane {
  const height = config.laneTiles * tileSize;
  const rows = Math.max(1, Math.round((arena.bottom - arena.top) / tileSize));
  const row = Math.floor((aimY - arena.top) / tileSize - (config.laneTiles - 1) / 2);
  const firstRow = Math.max(0, Math.min(rows - config.laneTiles, row));
  const top = arena.top + firstRow * tileSize;
  const wetUntil = now + config.sweepMs + config.wetMs;
  return { left: arena.left, right: arena.right, top, bottom: top + height, startAt: now, sweepMs: config.sweepMs, fromLeft, wetUntil, goneAt: wetUntil + config.dryMs };
}

/** Jak daleko (0–1) mop przejechał pas. */
export function sweepProgress(lane: WetLane, now: number): number {
  if (lane.sweepMs <= 0) return 1;
  return Math.max(0, Math.min(1, (now - lane.startAt) / lane.sweepMs));
}

/** Krawędź umytej części pasa (px w osi x). */
export function sweepFront(lane: WetLane, now: number): number {
  const t = sweepProgress(lane, now);
  return lane.fromLeft ? lane.left + (lane.right - lane.left) * t : lane.right - (lane.right - lane.left) * t;
}

/** Czy punkt leży na mokrym fragmencie pasa (umytym, jeszcze nie wyschniętym). */
export function isOnWetLane(lane: WetLane, point: Vector2, now: number): boolean {
  if (now < lane.startAt || now >= lane.wetUntil) return false;
  if (point.y < lane.top || point.y >= lane.bottom || point.x < lane.left || point.x > lane.right) return false;
  const front = sweepFront(lane, now);
  return lane.fromLeft ? point.x <= front : point.x >= front;
}

export function isInPuddle(puddle: WetPuddle, point: Vector2, now: number): boolean {
  return now < puddle.until && Math.hypot(point.x - puddle.center.x, point.y - puddle.center.y) <= puddle.radius;
}

/** Czy punkt jest mokry (pas albo kałuża z wiadra). */
export function isWet(point: Vector2, lanes: readonly WetLane[], puddles: readonly WetPuddle[], now: number): boolean {
  return lanes.some((lane) => isOnWetLane(lane, point, now)) || puddles.some((puddle) => isInPuddle(puddle, point, now));
}

/** Pasy jeszcze widoczne; nadmiar ponad `maxLanes` — najstarsze znikają. */
export function liveLanes(lanes: readonly WetLane[], now: number, maxLanes: number): WetLane[] {
  const alive = lanes.filter((lane) => now < lane.goneAt);
  return alive.slice(Math.max(0, alive.length - Math.max(1, maxLanes)));
}

/** Czy boss pędzący z prędkością `speed` po mokrym wpada w poślizg (chód nie, szarża tak; z przerwą `cooldownMs`). */
export function shouldBossSlide(speed: number, onWet: boolean, now: number, lastSlideAt: number, slide: WetFloorConfig['bossSlide']): boolean {
  return onWet && speed >= slide.minSpeed && now - lastSlideAt >= slide.cooldownMs;
}

/** Kałuża z wiadra: rozlewa się `spillOffsetPx` od wiadra w kierunku od atakującego. */
export function spillPuddle(bucket: Vector2, attacker: Vector2, now: number, config: WetFloorConfig): WetPuddle {
  const dx = bucket.x - attacker.x;
  const dy = bucket.y - attacker.y;
  const len = Math.hypot(dx, dy);
  const off = config.buckets.spillOffsetPx;
  const center = len > 0.001 ? { x: bucket.x + (dx / len) * off, y: bucket.y + (dy / len) * off } : { x: bucket.x, y: bucket.y + off };
  return { center, radius: config.buckets.puddleRadius, until: now + config.buckets.puddleMs };
}
