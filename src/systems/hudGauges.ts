import { HUD_GAUGES, type GaugeTheme } from '@/config/hudGaugeConfig';

/**
 * Ruch żywych wskaźników bohatera (krok U7e) — czyste funkcje czasu i postępu; rysuje `ui/ClassGauges.ts`.
 */

/** Motyw wskaźników dla broni bohatera. */
export function gaugeThemeFor(kit: keyof typeof HUD_GAUGES.byKit): GaugeTheme {
  return HUD_GAUGES.byKit[kit];
}

/** Bicie serca: 1 w czasie uderzenia, 0 poza nim (dwa uderzenia na okres — „lub-dub”). */
export function heartbeatLevel(timeMs: number, config = HUD_GAUGES.heartbeat): number {
  const phase = (((timeMs % config.periodMs) + config.periodMs) % config.periodMs) / config.periodMs;
  return config.beats.some(([from, to]) => phase >= from && phase < to) ? 1 : 0;
}

/** Początek jaśniejszego odcinka krwi płynącej przez wypełnioną część żyły (`filled` px). */
export function flowStart(timeMs: number, filled: number, config = HUD_GAUGES.flow): number {
  if (filled <= 0) return 0;
  const span = filled + config.lengthPx;
  return Math.floor(((timeMs / 1000) * config.speedPxPerSec) % span) - config.lengthPx;
}

/** Położenia iskier płynących w prawo przez wypełnioną część strumienia (`filled` px). */
export function sparklePositions(timeMs: number, filled: number, config = HUD_GAUGES.sparkles): number[] {
  if (filled <= 0) return [];
  const base = (timeMs / 1000) * config.speedPxPerSec;
  return Array.from({ length: config.count }, (_, i) => Math.floor((base + (i * filled) / config.count) % filled));
}

/**
 * Ugięcie cięciwy w punkcie `x` (0..width-1): luźna struna zwisa parabolą tym głębiej, im mniej gotowy dash;
 * gotowa jest prosta, a tuż po napięciu drga (±1 px) przez `twangMs`.
 */
export function stringSag(x: number, width: number, readiness: number, sinceReadyMs: number | null, config = HUD_GAUGES.string): number {
  const u = width > 1 ? x / (width - 1) : 0;
  const bell = 4 * u * (1 - u);
  if (readiness < 1) return Math.round(config.sagPx * (1 - readiness) * bell);
  if (sinceReadyMs === null || sinceReadyMs >= config.twangMs) return 0;
  const swing = Math.floor(sinceReadyMs / config.twangPeriodMs) % 2 === 0 ? 1 : -1;
  return Math.round(swing * bell);
}

/** Ile wierszy ikony (od dołu) wypełnia ładunek o postępie `progress`. */
export function filledRows(height: number, progress: number): number {
  return Math.max(0, Math.min(height, Math.round(height * progress)));
}

/** Naciąg cięciwy łuku (px) przy postępie ładowania; gotowy ładunek = pełny naciąg. */
export function bowPull(progress: number, maxPull = HUD_GAUGES.bow.maxPull): number {
  return Math.max(0, Math.min(maxPull, Math.round(maxPull * progress)));
}
