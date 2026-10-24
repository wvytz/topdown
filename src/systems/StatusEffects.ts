import type { BurnEffect, StatusApplication, StatusResistance } from '@/core/combatTypes';

/** Wynik nałożenia statusów — encja może zareagować (np. boss odkłada atak o czas ogłuszenia). */
export interface StatusApplyResult {
  /** Czas nowego ogłuszenia (0, gdy nie nastąpiło, np. przez odporność). */
  readonly stunnedMs: number;
}

/**
 * Obrażenia rozłożone w czasie (podpalenie, trucizna): ponowne nałożenie przedłuża czas,
 * silniejsze tyknięcie zastępuje słabsze.
 */
class DamageOverTime {
  private until = -Infinity;
  private tickDamage = 0;
  private tickMs = 0;
  private nextAt = Infinity;

  apply(effect: BurnEffect, now: number): void {
    if (effect.tickDamage <= 0) return;
    const wasActive = this.isActive(now);
    if (!wasActive) this.nextAt = now + effect.tickMs;
    this.until = Math.max(this.until, now + effect.durationMs);
    this.tickDamage = wasActive ? Math.max(this.tickDamage, effect.tickDamage) : effect.tickDamage;
    this.tickMs = effect.tickMs;
  }

  /** Obrażenia należne do chwili `now` (nadrabia tyknięcia, jeśli klatki były rzadkie). */
  takeDamage(now: number): number {
    let damage = 0;
    while (this.nextAt <= now && this.nextAt <= this.until) {
      damage += this.tickDamage;
      this.nextAt += this.tickMs;
    }
    if (now >= this.until) this.nextAt = Infinity;
    return damage;
  }

  isActive(now: number): boolean {
    return now < this.until;
  }
}

/**
 * Statusy na celu: podpalenie, trucizna, spowolnienie, ogłuszenie, paraliż (krok 29). Czas przekazujemy jawnie (`now`, ms).
 * Ten sam status się nie sumuje — silniejszy lub dłuższy zastępuje słabszy.
 */
export class StatusEffects {
  private readonly burn = new DamageOverTime();
  private readonly poison = new DamageOverTime();
  private slowUntil = -Infinity;
  private slowPct = 0;
  private stunUntil = -Infinity;
  private stunImmuneUntil = -Infinity;
  private paralyzedUntil = -Infinity;
  private paralysisImmuneUntil = -Infinity;

  constructor(private readonly resistance: StatusResistance) {}

  apply(status: StatusApplication | undefined, now: number): StatusApplyResult {
    if (!status) return { stunnedMs: 0 };

    if (status.burn) this.burn.apply(this.resistBurn(status.burn), now);
    if (status.poison) this.poison.apply(status.poison, now);

    if (status.slow && status.slow.pct > 0) {
      const pct = Math.min(1, status.slow.pct * this.resistance.slowMultiplier);
      this.slowPct = this.isSlowed(now) ? Math.max(this.slowPct, pct) : pct;
      this.slowUntil = Math.max(this.slowUntil, now + status.slow.durationMs);
    }

    let stunnedMs = 0;
    if (status.stun && now >= this.stunImmuneUntil) {
      stunnedMs = Math.round(status.stun.durationMs * this.resistance.stunMultiplier);
      if (stunnedMs > 0) {
        this.stunUntil = now + stunnedMs;
        this.stunImmuneUntil = this.stunUntil + this.resistance.stunImmunityMs;
      }
    }
    if (status.paralysis && status.paralysis.durationMs > 0 && now >= this.paralysisImmuneUntil && !this.isParalyzed(now)) {
      this.paralyzedUntil = now + status.paralysis.durationMs;
      this.paralysisImmuneUntil = this.paralyzedUntil + (this.resistance.paralysisImmunityMs ?? 0);
    }
    return { stunnedMs };
  }

  /** Krok 93: odporność na ogień osłabia tyknięcie (zaokrąglone, ale co najmniej 1 HP). */
  private resistBurn(burn: BurnEffect): BurnEffect {
    const multiplier = this.resistance.burnMultiplier ?? 1;
    if (multiplier === 1 || burn.tickDamage <= 0) return burn;
    return { ...burn, tickDamage: Math.max(1, Math.round(burn.tickDamage * multiplier)) };
  }

  /** Obrażenia od podpalenia należne do chwili `now` (nadrabia tyknięcia, jeśli klatki były rzadkie). */
  takeBurnDamage(now: number): number {
    return this.burn.takeDamage(now);
  }

  /** Obrażenia od trucizny należne do chwili `now`. */
  takePoisonDamage(now: number): number {
    return this.poison.takeDamage(now);
  }

  /** Mnożnik prędkości ruchu (1 = bez spowolnienia). */
  speedMultiplier(now: number): number {
    return this.isSlowed(now) ? 1 - this.slowPct : 1;
  }

  isBurning(now: number): boolean {
    return this.burn.isActive(now);
  }

  isPoisoned(now: number): boolean {
    return this.poison.isActive(now);
  }

  isSlowed(now: number): boolean {
    return now < this.slowUntil;
  }

  isParalyzed(now: number): boolean {
    return now < this.paralyzedUntil;
  }

  isStunned(now: number): boolean {
    return now < this.stunUntil;
  }
}
