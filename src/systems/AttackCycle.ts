import type { AttackSeries } from '@/core/combatTypes';
import { AttackPhase } from '@/core/combatTypes';

/**
 * Cykl ataku: zamach (windup) → uderzenie (jednorazowe „release”) → odnowienie.
 * Cooldown liczony jest od rozpoczęcia ataku. Przy windupMs = 0 uderzenie następuje od razu.
 * Z serią (krok 123) ciosy idą co `gapMs` po uderzeniu, a po ostatnim — zadyszka i pełny cooldown.
 */
export class AttackCycle {
  private startedAt = -Infinity;
  private released = true;
  /** Który cios serii trwa (0 = pierwszy); bez serii zawsze 0. */
  private strike = 0;

  constructor(
    private readonly windupMs: number,
    private readonly cooldownMs: number,
    private readonly series?: AttackSeries,
  ) {}

  phase(now: number): AttackPhase {
    const elapsed = now - this.startedAt;
    if (elapsed < this.windupMs) return AttackPhase.Windup;
    if (elapsed < this.currentCooldown()) return AttackPhase.Recovery;
    return AttackPhase.Ready;
  }

  tryStart(now: number): boolean {
    if (this.phase(now) !== AttackPhase.Ready) return false;
    if (this.series && this.startedAt > -Infinity) this.strike = this.isLastStrike() ? 0 : this.strike + 1;
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

  /** Zadyszka po ostatnim ciosie serii (krok 123): wróg stoi i nie atakuje. */
  isBreathing(now: number): boolean {
    if (!this.series || !this.isLastStrike()) return false;
    const sinceRelease = now - this.startedAt - this.windupMs;
    return sinceRelease >= 0 && sinceRelease < this.series.breatherMs;
  }

  /** 0..1, 1 = gotowy do kolejnego ataku. */
  readiness(now: number): number {
    const total = this.currentCooldown();
    if (total <= 0) return 1;
    return Math.min(1, Math.max(0, (now - this.startedAt) / total));
  }

  private isLastStrike(): boolean {
    return !this.series || this.strike >= this.series.hits - 1;
  }

  /** Czas od początku zamachu do gotowości: w środku serii krótki, po ostatnim ciosie — co najmniej zadyszka. */
  private currentCooldown(): number {
    if (!this.series) return Math.max(this.cooldownMs, this.windupMs);
    if (!this.isLastStrike()) return this.windupMs + this.series.gapMs;
    return Math.max(this.cooldownMs, this.windupMs + this.series.breatherMs);
  }
}
