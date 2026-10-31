import type { AttackRampEffect } from '@/core/combatTypes';

/**
 * Rozpęd (krok 150, Rękawice ×3): ciągły atak co `stepEveryMs` podnosi stopień tempa (do `steps`),
 * a przerwa dłuższa niż `resetAfterMs` od ostatniego ataku go zeruje. Czysta logika z jawnym czasem.
 */
export class AttackRamp {
  private startedAt = -Infinity;
  private lastAttackAt = -Infinity;

  /** Atak bohatera (cios, strzała, kula). */
  onAttack(now: number, effect: AttackRampEffect): void {
    if (now - this.lastAttackAt > effect.resetAfterMs) this.startedAt = now;
    this.lastAttackAt = now;
  }

  /** Bieżący stopień 0…steps. */
  step(now: number, effect: AttackRampEffect | null): number {
    if (!effect || now - this.lastAttackAt > effect.resetAfterMs) return 0;
    return Math.min(effect.steps, Math.floor((now - this.startedAt) / effect.stepEveryMs));
  }

  /** Dodatkowe tempo ataku z rozpędu (np. 0,16 = +16%). */
  bonus(now: number, effect: AttackRampEffect | null): number {
    return effect ? this.step(now, effect) * effect.stepPct : 0;
  }
}
