import type { DamageResult } from '@/core/combatTypes';

export class Health {
  private current: number;
  private maximum: number;

  /** `current` pozwala przenieść HP między piętrami; domyślnie pełne zdrowie. */
  constructor(max: number, current: number = max) {
    this.maximum = max;
    this.current = Math.min(max, Math.max(0, current));
  }

  get value(): number {
    return this.current;
  }

  get max(): number {
    return this.maximum;
  }

  get isFull(): boolean {
    return this.current >= this.maximum;
  }

  /** Zmiana maksimum (np. przedmiot): wzrost maksimum leczy o tę samą wartość. */
  setMax(newMax: number): void {
    const growth = Math.max(0, newMax - this.maximum);
    this.maximum = Math.max(1, newMax);
    if (this.isDead) return;
    this.current = Math.min(this.maximum, this.current + growth);
  }

  get isDead(): boolean {
    return this.current <= 0;
  }

  takeDamage(amount: number): DamageResult {
    if (this.isDead) return { dealt: 0, died: false };
    const dealt = Math.min(this.current, Math.max(0, amount));
    this.current -= dealt;
    return { dealt, died: this.isDead };
  }

  /** Wskrzeszenie w co-opie (etap C4): tylko z zera, do `amount` HP (najwyżej maksimum). */
  revive(amount: number): void {
    if (!this.isDead) return;
    this.current = Math.min(this.maximum, Math.max(1, amount));
  }

  heal(amount: number): void {
    if (this.isDead) return;
    this.current = Math.min(this.max, this.current + Math.max(0, amount));
  }
}
