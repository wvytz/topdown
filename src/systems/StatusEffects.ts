import type { StatusApplication, StatusResistance } from '@/core/combatTypes';

/** Wynik nałożenia statusów — encja może zareagować (np. boss odkłada atak o czas ogłuszenia). */
export interface StatusApplyResult {
  /** Czas nowego ogłuszenia (0, gdy nie nastąpiło, np. przez odporność). */
  readonly stunnedMs: number;
}

/**
 * Statusy na celu: podpalenie, spowolnienie, ogłuszenie. Czas przekazujemy jawnie (`now`, ms).
 * Ten sam status się nie sumuje — silniejszy lub dłuższy zastępuje słabszy.
 */
export class StatusEffects {
  private burnUntil = -Infinity;
  private burnTickDamage = 0;
  private burnTickMs = 0;
  private nextBurnAt = Infinity;
  private slowUntil = -Infinity;
  private slowPct = 0;
  private stunUntil = -Infinity;
  private stunImmuneUntil = -Infinity;

  constructor(private readonly resistance: StatusResistance) {}

  apply(status: StatusApplication | undefined, now: number): StatusApplyResult {
    if (!status) return { stunnedMs: 0 };

    if (status.burn && status.burn.tickDamage > 0) {
      const wasBurning = this.isBurning(now);
      if (!wasBurning) this.nextBurnAt = now + status.burn.tickMs;
      this.burnUntil = Math.max(this.burnUntil, now + status.burn.durationMs);
      this.burnTickDamage = wasBurning ? Math.max(this.burnTickDamage, status.burn.tickDamage) : status.burn.tickDamage;
      this.burnTickMs = status.burn.tickMs;
    }

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
    return { stunnedMs };
  }

  /** Obrażenia od podpalenia należne do chwili `now` (nadrabia tyknięcia, jeśli klatki były rzadkie). */
  takeBurnDamage(now: number): number {
    let damage = 0;
    while (this.nextBurnAt <= now && this.nextBurnAt <= this.burnUntil) {
      damage += this.burnTickDamage;
      this.nextBurnAt += this.burnTickMs;
    }
    if (now >= this.burnUntil) this.nextBurnAt = Infinity;
    return damage;
  }

  /** Mnożnik prędkości ruchu (1 = bez spowolnienia). */
  speedMultiplier(now: number): number {
    return this.isSlowed(now) ? 1 - this.slowPct : 1;
  }

  isBurning(now: number): boolean {
    return now < this.burnUntil;
  }

  isSlowed(now: number): boolean {
    return now < this.slowUntil;
  }

  isStunned(now: number): boolean {
    return now < this.stunUntil;
  }
}
