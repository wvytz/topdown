import { AttackPhase } from '@/core/combatTypes';

/**
 * Cykl ataku: zamach (windup) → uderzenie (jednorazowe „release”) → odnowienie.
 * Cooldown liczony jest od rozpoczęcia ataku. Przy windupMs = 0 uderzenie następuje od razu.
 */
export class AttackCycle {
  private startedAt = -Infinity;
  private released = true;

  constructor(
    private readonly windupMs: number,
    private readonly cooldownMs: number,
  ) {}

  phase(now: number): AttackPhase {
    const elapsed = now - this.startedAt;
    if (elapsed < this.windupMs) return AttackPhase.Windup;
    if (elapsed < Math.max(this.cooldownMs, this.windupMs)) return AttackPhase.Recovery;
    return AttackPhase.Ready;
  }

  tryStart(now: number): boolean {
    if (this.phase(now) !== AttackPhase.Ready) return false;
    this.startedAt = now;
    this.released = false;
    return true;
  }

  /** Zwraca true dokładnie raz — w pierwszej klatce po zakończeniu zamachu. */
  consumeRelease(now: number): boolean {
    if (this.released || now - this.startedAt < this.windupMs) return false;
    this.released = true;
    return true;
  }

  /** Przerywa zamach (np. ogłuszenie): uderzenie nie nastąpi, odnowienie biegnie dalej. */
  interrupt(): void {
    this.released = true;
  }

  /** 0..1, 1 = gotowy do kolejnego ataku. */
  readiness(now: number): number {
    const total = Math.max(this.cooldownMs, this.windupMs);
    if (total <= 0) return 1;
    return Math.min(1, Math.max(0, (now - this.startedAt) / total));
  }
}
