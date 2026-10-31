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
    private max: number,
    private rechargeMs: number,
  ) {
    this.stored = max;
  }

  get maxCharges(): number {
    return this.max;
  }

  /** Zmiana pojemności (np. Kołczan): nowe miejsca przychodzą od razu naładowane. */
  resize(maxCharges: number, now: number): void {
    this.sync(now);
    const gained = Math.max(0, maxCharges - this.max);
    this.max = maxCharges;
    this.stored = Math.min(this.max, this.stored + gained);
  }

  /** Krok 150 (Kołczan bez dna): nowy czas ładowania; bieżący ładunek liczy się dalej od swojego początku. */
  setRechargeMs(rechargeMs: number, now: number): void {
    this.sync(now);
    this.rechargeMs = rechargeMs;
  }

  /** Krok 150: przejmuje stan innej puli (nowy dash po zmianie przedmiotów), z limitem własnej pojemności. */
  copyStateFrom(other: ChargePool, now: number): void {
    other.sync(now);
    this.stored = Math.min(this.max, other.stored);
    this.rechargeStartedAt = other.rechargeStartedAt;
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
    if (this.stored === this.max) this.rechargeStartedAt = now;
    this.stored--;
    return true;
  }

  /** 0..1 postęp ładowania kolejnego ładunku; 1, gdy pula jest pełna. */
  rechargeProgress(now: number): number {
    this.sync(now);
    if (this.stored >= this.max || this.rechargeMs <= 0) return 1;
    return Math.min(1, Math.max(0, (now - this.rechargeStartedAt) / this.rechargeMs));
  }

  private sync(now: number): void {
    if (this.stored >= this.max) return;
    if (this.rechargeMs <= 0) {
      this.stored = this.max;
      return;
    }
    const gained = Math.floor((now - this.rechargeStartedAt) / this.rechargeMs);
    if (gained <= 0) return;
    this.stored = Math.min(this.max, this.stored + gained);
    this.rechargeStartedAt += gained * this.rechargeMs;
  }
}
