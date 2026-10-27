import type { RootEffect } from '@/core/bossTypes';

/**
 * Unieruchomienie (plątanie brunetki, krok 126): trafiony stoi przez `durationMs`, potem przez `immunityMs`
 * odporny na kolejne — nigdy dwa unieruchomienia pod rząd. Atakować wolno; ruch i dash są zablokowane.
 */
export class RootState {
  private until = -Infinity;
  private immuneUntil = -Infinity;

  /** Zwraca true, gdy unieruchomienie się zaczęło (nie trwało i nie było odporności). */
  apply(effect: RootEffect, now: number): boolean {
    if (this.isRooted(now) || now < this.immuneUntil) return false;
    this.until = now + effect.durationMs;
    this.immuneUntil = this.until + effect.immunityMs;
    return true;
  }

  isRooted(now: number): boolean {
    return now < this.until;
  }

  /** Ułamek pozostałego unieruchomienia (0 — wolny); do animacji pękania włosia. */
  remaining(now: number): number {
    return Math.max(0, this.until - now);
  }

  clear(): void {
    this.until = -Infinity;
  }
}
