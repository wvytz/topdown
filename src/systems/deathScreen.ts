import type { DeathDripConfig, DeathSplatConfig, DeathTiming } from '@/config/deathScreenConfig';
import { DEATH_DRIPS, DEATH_SPLAT, DEATH_TIMING } from '@/config/deathScreenConfig';
import type { PixelCell } from '@/core/pixelArt';
import type { Rng } from '@/core/random';

/** Stan ekranu śmierci w chwili `t` (ms od śmierci) — HUD tylko go rysuje. */
export interface DeathFrame {
  readonly dimAlpha: number;
  readonly titleVisible: boolean;
  readonly titleScale: number;
  readonly flashAlpha: number;
  /** Skala plamy krwi (0 = jeszcze jej nie ma). */
  readonly splatScale: number;
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

/** Plama rozpryskuje się w chwili uderzenia: 0 → przestrzelenie → 1. */
function splatScaleAt(t: number, timing: DeathTiming): number {
  const s = t - deathImpactAt(timing);
  if (s < 0) return 0;
  if (s < timing.splatGrowMs) return lerp(0.25, timing.splatOvershoot, easeOutCubic(s / timing.splatGrowMs));
  if (s < timing.splatGrowMs + timing.splatSettleMs) {
    return lerp(timing.splatOvershoot, 1, (s - timing.splatGrowMs) / timing.splatSettleMs);
  }
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
    splatScale: splatScaleAt(t, timing),
    scoreAlpha: clamp01((t - timing.scoreAt) / timing.scoreFadeDuration),
    rowsVisible: t < timing.rowsAt ? 0 : 1 + Math.floor((t - timing.rowsAt) / timing.rowInterval),
    promptVisible: t >= timing.promptAt && blinkPhase < timing.promptOnFraction,
  };
}

// ——— strugi krwi ———

export interface Drip {
  /** Piksel fontu, z którego dolnej krawędzi cieknie krew. */
  readonly cell: PixelCell;
  /** Kiedy zaczyna cieknąć (ms od śmierci). */
  readonly startAt: number;
  readonly growMs: number;
  /** Pełna długość strugi (px ekranu). */
  readonly maxLength: number;
  /** Co ile ms z czubka pełnej strugi odrywa się kropla. */
  readonly dropPeriodMs: number;
}

const key = (x: number, y: number): string => `${x},${y}`;

/** Strugi: losowe dolne krawędzie liter (pod pikselem pusto), bez akcentu nad Ś; każda w swoim tempie. */
export function planDrips(cells: readonly PixelCell[], rng: Rng, cfg: DeathDripConfig = DEATH_DRIPS): Drip[] {
  const occupied = new Set(cells.map((c) => key(c.x, c.y)));
  const pool = cells.filter(({ x, y }) => y >= 0 && !occupied.has(key(x, y + 1)));
  const drips: Drip[] = [];
  while (drips.length < cfg.count && pool.length > 0) {
    const [cell] = pool.splice(rng.int(0, pool.length - 1), 1);
    if (!cell) break;
    drips.push({
      cell,
      startAt: cfg.startAt + rng.int(0, cfg.startSpread),
      growMs: rng.int(cfg.minGrowMs, cfg.maxGrowMs),
      maxLength: rng.int(cfg.minLength, cfg.maxLength),
      dropPeriodMs: rng.int(cfg.minDropPeriodMs, cfg.maxDropPeriodMs),
    });
  }
  return drips;
}

/** Długość strugi w chwili `t`: rośnie od 0 i zwalnia, aż osiągnie pełną długość. */
export function dripLength(drip: Drip, t: number): number {
  const k = clamp01((t - drip.startAt) / drip.growMs);
  return Math.round(drip.maxLength * easeOutCubic(k));
}

/** Ile kropel oderwało się od pełnej strugi do chwili `t` — HUD tworzy kroplę, gdy liczba rośnie. */
export function dropsReleased(drip: Drip, t: number): number {
  const full = drip.startAt + drip.growMs;
  if (t < full) return 0;
  return Math.floor((t - full) / drip.dropPeriodMs);
}

// ——— plama krwi ———

export interface SplatCell extends PixelCell {
  /** Brzeg plamy (ciemniejszy) albo wnętrze; `sheen` = połysk świeżej krwi. */
  readonly tone: 'edge' | 'inner' | 'sheen';
}

function addDisc(target: Set<string>, cx: number, cy: number, r: number): void {
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) if (x * x + y * y <= r * r) target.add(key(Math.round(cx + x), Math.round(cy + y)));
  }
}

/**
 * Plama krwi wokół (0, 0) w komórkach: zlepek kół w elipsie (rx × ry), drobne krople wokół
 * i promieniste smugi rozbryzgu. Deterministyczna dla danego RNG.
 */
export function planSplat(rng: Rng, cfg: DeathSplatConfig = DEATH_SPLAT): SplatCell[] {
  const cells = new Set<string>();
  // Rdzeń: zwarta elipsa pod napisem.
  const coreX = cfg.rx * 0.78;
  const coreY = cfg.ry * 0.72;
  for (let y = -Math.ceil(coreY); y <= coreY; y++) {
    for (let x = -Math.ceil(coreX); x <= coreX; x++) if ((x / coreX) ** 2 + (y / coreY) ** 2 <= 1) cells.add(key(x, y));
  }
  // Nieregularny brzeg: koła rozłożone wokół rdzenia.
  for (let i = 0; i < cfg.blobCount; i++) {
    const a = (i / cfg.blobCount) * Math.PI * 2 + rng.next() * 0.4;
    const d = 0.62 + rng.next() * 0.3;
    const r = cfg.blobMinRadius + rng.next() * (cfg.blobMaxRadius - cfg.blobMinRadius);
    addDisc(cells, Math.cos(a) * d * cfg.rx, Math.sin(a) * d * cfg.ry, r);
  }
  // Oderwane krople tuż za brzegiem.
  for (let i = 0; i < cfg.dropletCount; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = 1 + rng.next() * 0.3;
    addDisc(cells, Math.cos(a) * d * cfg.rx, Math.sin(a) * d * cfg.ry * 1.15, 0.5 + rng.next() * (cfg.dropletMaxRadius - 0.5));
  }
  for (let i = 0; i < cfg.streakCount; i++) {
    const a = rng.next() * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    // Smuga zaczyna się na brzegu elipsy i zwęża się na zewnątrz.
    const edge = 1 / Math.sqrt((ux / cfg.rx) ** 2 + (uy / cfg.ry) ** 2);
    for (let s = 0; s < cfg.streakLength; s += 2) {
      const r = 1.6 * (1 - s / cfg.streakLength) + 0.5;
      addDisc(cells, ux * (edge + s), uy * (edge + s) * 0.7, r);
    }
  }
  return [...cells].map((k) => {
    const [x, y] = k.split(',').map(Number) as [number, number];
    const edge = !cells.has(key(x - 1, y)) || !cells.has(key(x + 1, y)) || !cells.has(key(x, y - 1)) || !cells.has(key(x, y + 1));
    const tone = edge ? 'edge' : rng.chance(cfg.sheenChance) ? 'sheen' : 'inner';
    return { x, y, tone };
  });
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
