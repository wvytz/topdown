import type { HeroDefinition, UltimateConfig, UltimateGaugeConfig } from '@/core/heroTypes';
import type { Vector2 } from '@/core/types';
import type { PlayerLoadout } from '@/systems/PlayerLoadout';

/**
 * Pasek mocy ultimate (krok 98): rośnie z czasem i za zabicia, pełny pozwala użyć R.
 * W trakcie działania ultimate pasek stoi. Stan liczony z jawnego `now` (ms).
 */
export class UltimateGauge {
  private charge: number;
  private lastAt: number | null = null;
  private activeUntil = -Infinity;

  constructor(private readonly config: UltimateGaugeConfig) {
    this.charge = clamp01(config.startCharge);
  }

  /** 0..1; 1 = gotowy. */
  value(now: number): number {
    this.sync(now);
    return this.charge;
  }

  isReady(now: number): boolean {
    return this.value(now) >= 1;
  }

  /** Ultimate działa (pasek stoi). */
  isActive(now: number): boolean {
    return now < this.activeUntil;
  }

  addKill(now: number): void {
    this.sync(now);
    if (!this.isActive(now)) this.charge = clamp01(this.charge + this.config.perKill);
  }

  /** Zużywa pełny pasek; `activeMs` — jak długo ultimate działa (pasek wtedy nie rośnie). */
  tryUse(now: number, activeMs: number): boolean {
    if (!this.isReady(now)) return false;
    this.charge = 0;
    this.activeUntil = now + Math.max(0, activeMs);
    return true;
  }

  private sync(now: number): void {
    if (this.lastAt === null) {
      this.lastAt = now;
      return;
    }
    // Czas działania ultimate się nie liczy.
    const from = Math.max(this.lastAt, this.activeUntil);
    this.lastAt = Math.max(this.lastAt, now);
    if (now <= from) return;
    this.charge = clamp01(this.charge + ((now - from) / 1000) * this.config.passivePerSec);
  }
}

/** Pasek mocy bohatera: wspólne liczby z nadpisaniami bohatera (krok 117: barbarzyńca mniej za zabicie). */
export function gaugeConfigFor(hero: HeroDefinition, base: UltimateGaugeConfig): UltimateGaugeConfig {
  return { ...base, ...hero.ultimateGauge };
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Jak długo ultimate „trwa” (pasek wtedy stoi): szał, tarcza Supernowej albo totem. */
export function ultimateActiveMs(ultimate: UltimateConfig): number {
  switch (ultimate.kind) {
    case 'rage':
      return ultimate.durationMs;
    case 'supernova':
      return ultimate.shieldMs;
    case 'totem':
      return ultimate.durationMs;
  }
}

/** Nietykalność z ultimate: szał (jeśli `invulnerable`) albo tarcza Supernowej; totem jej nie daje. */
export function ultimateGuardMs(ultimate: UltimateConfig): number {
  switch (ultimate.kind) {
    case 'rage':
      return ultimate.invulnerable ? ultimate.durationMs : 0;
    case 'supernova':
      return ultimate.shieldMs;
    case 'totem':
      return 0;
  }
}

/** Szał barbarzyńcy: szybsze i mocniejsze ciosy i strzały, szybszy chód. */
export function applyRage(loadout: PlayerLoadout, rage: Extract<UltimateConfig, { kind: 'rage' }>): PlayerLoadout {
  const { stats, combat } = loadout;
  const faster = (ms: number): number => Math.max(1, Math.round(ms * rage.attackCooldownMultiplier));
  const harder = (damage: number): number => Math.max(1, Math.round(damage * rage.damageMultiplier));
  return {
    ...loadout,
    stats: { ...stats, moveSpeed: Math.round(stats.moveSpeed * rage.moveSpeedMultiplier) },
    combat: {
      ...combat,
      meleeDamage: harder(combat.meleeDamage),
      attackCooldownMs: faster(combat.attackCooldownMs),
      ranged: { ...combat.ranged, damage: harder(combat.ranged.damage), shotIntervalMs: faster(combat.ranged.shotIntervalMs) },
    },
  };
}

/** Najbliższy cel w zasięgu (totem łucznika); null — nikogo. */
export function nearestInRange<T extends Vector2>(origin: Vector2, targets: readonly T[], range: number): T | null {
  let best: T | null = null;
  let bestDistance = range;
  for (const target of targets) {
    const d = Math.hypot(target.x - origin.x, target.y - origin.y);
    if (d <= bestDistance) {
      best = target;
      bestDistance = d;
    }
  }
  return best;
}
