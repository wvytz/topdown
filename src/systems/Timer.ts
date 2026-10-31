/** Prosty licznik czasu oparty o znacznik „teraz” (ms) — bez zależności od zegara Phasera. */
export class Timer {
  private startedAt = -Infinity;
  private endsAt = -Infinity;

  start(now: number, durationMs: number): void {
    this.startedAt = now;
    this.endsAt = now + durationMs;
  }

  /** Krok 150: ten sam stan co `other` (np. dash przeniesiony do nowej konfiguracji). */
  copyFrom(other: Timer): void {
    this.startedAt = other.startedAt;
    this.endsAt = other.endsAt;
  }

  isActive(now: number): boolean {
    return now < this.endsAt;
  }

  /** 0 = właśnie wystartował, 1 = zakończony. */
  progress(now: number): number {
    const duration = this.endsAt - this.startedAt;
    if (!Number.isFinite(duration) || duration <= 0) return 1;
    return Math.min(1, Math.max(0, (now - this.startedAt) / duration));
  }
}
