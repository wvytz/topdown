/**
 * Krok 93: sufit leczenia na sekundę (Wampirzy kieł). Wiadro żetonów: napełnia się stałym tempem
 * (`ratePerSec` HP/s), mieści zapas na 1 s, a każde leczenie zabiera z niego całe HP.
 * Czas przekazujemy jawnie (`now`, ms).
 */
export class HealBudget {
  private tokens: number | null = null;
  private lastAt = 0;

  /** Ile z `want` HP wolno teraz wyleczyć (0, gdy zapas jest pusty). */
  take(want: number, now: number, ratePerSec: number): number {
    const capacity = Math.max(0, ratePerSec);
    const refilled = this.tokens === null ? capacity : this.tokens + (Math.max(0, now - this.lastAt) / 1000) * capacity;
    const available = Math.min(capacity, refilled);
    const granted = Math.max(0, Math.min(want, Math.floor(available)));
    this.tokens = available - granted;
    this.lastAt = now;
    return granted;
  }
}
