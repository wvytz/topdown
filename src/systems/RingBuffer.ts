/**
 * Bufor kołowy FIFO o stałej pojemności: po zapełnieniu nowy element wypycha najstarszy.
 * Czysta logika (np. pula trwałych śladów walki — wypchnięty obiekt można użyć ponownie).
 */
export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private head = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error(`RingBuffer: pojemność musi być ≥ 1 (jest ${capacity}).`);
    this.items = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.count;
  }

  get isFull(): boolean {
    return this.count === this.capacity;
  }

  /** Najstarszy element (ten, którego wypchnie następny push przy pełnym buforze). */
  oldest(): T | undefined {
    return this.count === 0 ? undefined : this.items[this.head];
  }

  /** Dodaje element; zwraca wypchnięty najstarszy (gdy bufor był pełny) albo undefined. */
  push(item: T): T | undefined {
    const index = (this.head + this.count) % this.capacity;
    if (this.count < this.capacity) {
      this.items[index] = item;
      this.count++;
      return undefined;
    }
    const evicted = this.items[this.head];
    this.items[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    return evicted;
  }

  /** Elementy od najstarszego do najnowszego. */
  toArray(): T[] {
    return Array.from({ length: this.count }, (_, i) => this.items[(this.head + i) % this.capacity] as T);
  }
}
