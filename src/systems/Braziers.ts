import type { Vector2 } from '@/core/types';

/**
 * Paleniska w Piekle (krok 41b, prośba właściciela): stoją na środku zwykłych pokojów i co jakiś czas buchają
 * ogniem; trzymanie się blisko rozżarzonej misy też parzy. Na kolejnych, „gorętszych” piętrach buchają częściej
 * (decyzja właściciela) — skraca się tylko przerwa, ostrzeżenie zostaje, żeby dało się uciec.
 * Liczby w biomeConfig.
 */
export interface BrazierConfig {
  /** Szansa, że zwykły pokój dostanie paleniska (0–1). */
  readonly roomChance: number;
  /** Pokój o dłuższym boku od tylu kafli dostaje dwa paleniska (na 1/3 i 2/3 długości), mniejszy jedno. */
  readonly twoFromLongSide: number;
  /** Paleniska tylko w pokojach o krótszym boku co najmniej tylu kafli (jest jak obejść strefę). */
  readonly minShortSide: number;
  /** Rozżarzona misa: gracz bliżej niż tyle (px, od środka do środka) parzy się stale. */
  readonly contact: { readonly radius: number; readonly damage: number; readonly knockback: number };
  /** Buchnięcie: obrażenia w całym promieniu. */
  readonly burst: { readonly radius: number; readonly damage: number; readonly knockback: number };
  readonly timing: BrazierTiming;
  /** Piętro, na którym obowiązuje `timing.idleMs`; każde wyższe mnoży przerwę przez `idlePerFloor`. */
  readonly heatBaseFloor: number;
  readonly idlePerFloor: number;
  /** Przerwa nie spada poniżej tylu ms, choćby piętro było bardzo wysokie. */
  readonly minIdleMs: number;
}

export interface BrazierTiming {
  /** Tlenie się: misa żarzy się, ale nie bucha (tylko kontakt parzy). */
  readonly idleMs: number;
  /** Ostrzeżenie: płomień rośnie, strefa jest zaznaczona. */
  readonly warnMs: number;
  /** Buchnięcie: ogień w całym promieniu. */
  readonly burstMs: number;
}

export enum BrazierPhase {
  Idle = 'idle',
  Warn = 'warn',
  Burst = 'burst',
}

export interface BrazierState {
  readonly phase: BrazierPhase;
  /** 0..1 postęp bieżącej fazy. */
  readonly progress: number;
}

/** Czasy cyklu na danym piętrze: im wyżej (goręcej), tym krótsza przerwa między buchnięciami. */
export function brazierTimingForFloor(config: BrazierConfig, floor: number): BrazierTiming {
  const hotter = Math.max(0, floor - config.heatBaseFloor);
  const idleMs = Math.max(config.minIdleMs, Math.round(config.timing.idleMs * config.idlePerFloor ** hotter));
  return { ...config.timing, idleMs };
}

/**
 * Faza paleniska w chwili `now`. `offsetMs` przesuwa cykl (każde palenisko ma własny, z RNG piętra),
 * żeby nie buchały wszystkie naraz.
 */
export function brazierState(timing: BrazierTiming, offsetMs: number, now: number): BrazierState {
  const cycle = timing.idleMs + timing.warnMs + timing.burstMs;
  const t = (((now + offsetMs) % cycle) + cycle) % cycle;
  if (t < timing.idleMs) return { phase: BrazierPhase.Idle, progress: t / timing.idleMs };
  if (t < timing.idleMs + timing.warnMs) return { phase: BrazierPhase.Warn, progress: (t - timing.idleMs) / timing.warnMs };
  return { phase: BrazierPhase.Burst, progress: (t - timing.idleMs - timing.warnMs) / timing.burstMs };
}

/** Numer bieżącego cyklu paleniska — jedno buchnięcie rani gracza najwyżej raz (trwa dłużej niż nietykalność). */
export function brazierCycleIndex(timing: BrazierTiming, offsetMs: number, now: number): number {
  return Math.floor((now + offsetMs) / (timing.idleMs + timing.warnMs + timing.burstMs));
}

/** Co palenisko robi graczowi w tej chwili: buchnięcie w promieniu albo oparzenie przy samej misie; null = nic. */
export function brazierDamage(
  config: Pick<BrazierConfig, 'contact' | 'burst'>,
  state: BrazierState,
  brazier: Vector2,
  player: Vector2,
): { readonly damage: number; readonly knockback: number } | null {
  const d = Math.hypot(player.x - brazier.x, player.y - brazier.y);
  if (state.phase === BrazierPhase.Burst && d <= config.burst.radius) return config.burst;
  if (d <= config.contact.radius) return config.contact;
  return null;
}
