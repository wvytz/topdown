import type { DeathCrumbleConfig, DeathTiming } from '@/config/deathScreenConfig';
import { DEATH_CRUMBLE, DEATH_TIMING } from '@/config/deathScreenConfig';
import type { PixelCell } from '@/core/pixelArt';
import type { Rng } from '@/core/random';

/** Stan ekranu śmierci w chwili `t` (ms od śmierci) — HUD tylko go rysuje. */
export interface DeathFrame {
  readonly dimAlpha: number;
  readonly titleVisible: boolean;
  readonly titleScale: number;
  readonly flashAlpha: number;
  readonly scoreAlpha: number;
  /** Ile wierszy tablicy już widać. */
  readonly rowsVisible: number;
  readonly promptVisible: boolean;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const easeOutCubic = (k: number): number => 1 - (1 - k) ** 3;

export function deathImpactAt(timing: DeathTiming = DEATH_TIMING): number {
  return timing.slamAt + timing.slamDuration;
}

function titleScaleAt(t: number, timing: DeathTiming): number {
  const impact = deathImpactAt(timing);
  if (t < impact) {
    return lerp(timing.slamFromScale, timing.slamUndershoot, easeOutCubic(clamp01((t - timing.slamAt) / timing.slamDuration)));
  }
  const half = timing.settleDuration / 2;
  const s = t - impact;
  if (s < half) return lerp(timing.slamUndershoot, timing.slamOvershoot, s / half);
  if (s < timing.settleDuration) return lerp(timing.slamOvershoot, 1, (s - half) / half);
  return 1;
}

export function deathFrame(t: number, timing: DeathTiming = DEATH_TIMING): DeathFrame {
  const impact = deathImpactAt(timing);
  const blinkPhase = (Math.max(0, t - timing.promptAt) % timing.promptBlinkPeriod) / timing.promptBlinkPeriod;
  return {
    dimAlpha: timing.dimAlpha * clamp01(t / timing.dimDuration),
    titleVisible: t >= timing.slamAt,
    titleScale: titleScaleAt(t, timing),
    flashAlpha: t < impact ? 0 : timing.flashAlpha * (1 - clamp01((t - impact) / timing.flashDuration)),
    scoreAlpha: clamp01((t - timing.scoreAt) / timing.scoreFadeDuration),
    rowsVisible: t < timing.rowsAt ? 0 : 1 + Math.floor((t - timing.rowsAt) / timing.rowInterval),
    promptVisible: t >= timing.promptAt && blinkPhase < timing.promptOnFraction,
  };
}

/** Piksele fontu rozbite na bloki `n×n` (drobniejszy rozkład niż cały piksel litery). */
export function splitIntoBlocks(cells: readonly PixelCell[], n: number): PixelCell[] {
  return cells.flatMap(({ x, y }) =>
    Array.from({ length: n * n }, (_, i) => ({ x: x * n + (i % n), y: y * n + Math.floor(i / n) })),
  );
}

const key = (x: number, y: number): string => `${x},${y}`;

/** Blok brzegowy: brakuje mu co najmniej jednego sąsiada (4-sąsiedztwo). */
function edgeFlags(blocks: readonly PixelCell[]): boolean[] {
  const occupied = new Set(blocks.map((b) => key(b.x, b.y)));
  return blocks.map(
    ({ x, y }) =>
      !occupied.has(key(x - 1, y)) || !occupied.has(key(x + 1, y)) || !occupied.has(key(x, y - 1)) || !occupied.has(key(x, y + 1)),
  );
}

/**
 * Plan rozkładu napisu: chwila odpadnięcia każdego bloku (ms od śmierci) albo null, gdy blok zostaje.
 * Najpierw kruszą się krawędzie liter, środek później i rzadziej; łącznie najwyżej `maxFraction` bloków.
 */
export function planCrumble(blocks: readonly PixelCell[], rng: Rng, cfg: DeathCrumbleConfig = DEATH_CRUMBLE): (number | null)[] {
  const edges = edgeFlags(blocks);
  const limit = Math.floor(blocks.length * cfg.maxFraction);
  let used = 0;
  return blocks.map((_, i) => {
    const edge = edges[i] ?? false;
    const falls = rng.chance(edge ? cfg.edgeChance : cfg.innerChance);
    const at = edge
      ? cfg.startAt + rng.next() * cfg.duration
      : cfg.startAt + cfg.duration * (cfg.innerDelayFraction + rng.next() * (1 - cfg.innerDelayFraction));
    if (!falls || used >= limit) return null;
    used++;
    return at;
  });
}

export interface DripSource {
  readonly block: PixelCell;
  readonly periodMs: number;
  /** Przesunięcie fazy (ms), żeby krople nie spadały naraz. */
  readonly offsetMs: number;
}

/** Źródła cieknącej krwi: bloki dolnych krawędzi liter (pod nimi pusto), losowo wybrane. */
export function planDrips(blocks: readonly PixelCell[], rng: Rng, cfg: DeathCrumbleConfig = DEATH_CRUMBLE): DripSource[] {
  const occupied = new Set(blocks.map((b) => key(b.x, b.y)));
  const bottoms = blocks.filter(({ x, y }) => !occupied.has(key(x, y + 1)) && y >= 0);
  const picked: DripSource[] = [];
  const pool = [...bottoms];
  while (picked.length < cfg.dripCount && pool.length > 0) {
    const [block] = pool.splice(rng.int(0, pool.length - 1), 1);
    if (!block) break;
    const periodMs = rng.int(cfg.dripMinPeriodMs, cfg.dripMaxPeriodMs);
    picked.push({ block, periodMs, offsetMs: rng.int(0, periodMs - 1) });
  }
  return picked;
}

/** Ile kropel źródło wypuściło do chwili `t` (licząc od `startAt`) — HUD tworzy kroplę, gdy liczba rośnie. */
export function dripsReleased(source: DripSource, t: number, startAt: number): number {
  if (t < startAt) return 0;
  return Math.floor((t - startAt + source.offsetMs) / source.periodMs);
}

export interface Particle {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

/** Krok ruchu kropli/odłamka z grawitacją (px, ms). */
export function stepParticle(p: Particle, dtMs: number, gravity: number): Particle {
  const vy = p.vy + gravity * dtMs;
  return { x: p.x + p.vx * dtMs, y: p.y + vy * dtMs, vx: p.vx, vy };
}
