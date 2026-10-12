/**
 * Pula ładunków odnawiających się z czasem (np. strzały gracza).
 * Ładunki wracają po jednym: kolejny zaczyna się ładować, gdy poprzedni się naładuje.
 * Stan jest liczony leniwie z jawnego `now` (ms).
 */
export class ChargePool {
  private stored: number;
  /** Początek ładowania kolejnego ładunku (ma znaczenie tylko, gdy pula nie jest pełna). */
  private rechargeStartedAt = 0;

  constructor(
    readonly maxCharges: number,
    private readonly rechargeMs: number,
  ) {
    this.stored = maxCharges;
  }

  available(now: number): number {
    this.sync(now);
    return this.stored;
  }

  /** Zużywa ładunek; false, gdy pula jest pusta. */
  tryConsume(now: number): boolean {
    this.sync(now);
    if (this.stored <= 0) return false;
    // Pełna pula nie ładowała się — odliczanie kolejnego ładunku zaczyna się teraz.
    if (this.stored === this.maxCharges) this.rechargeStartedAt = now;
    this.stored--;
    return true;
  }

  /** 0..1 postęp ładowania kolejnego ładunku; 1, gdy pula jest pełna. */
  rechargeProgress(now: number): number {
    this.sync(now);
    if (this.stored >= this.maxCharges || this.rechargeMs <= 0) return 1;
    return Math.min(1, Math.max(0, (now - this.rechargeStartedAt) / this.rechargeMs));
  }

  private sync(now: number): void {
    if (this.stored >= this.maxCharges) return;
    if (this.rechargeMs <= 0) {
      this.stored = this.maxCharges;
      return;
    }
    const gained = Math.floor((now - this.rechargeStartedAt) / this.rechargeMs);
    if (gained <= 0) return;
    this.stored = Math.min(this.maxCharges, this.stored + gained);
    this.rechargeStartedAt += gained * this.rechargeMs;
  }
}
