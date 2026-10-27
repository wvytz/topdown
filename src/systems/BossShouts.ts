import type { BossAttackKind, BossShoutDefinition } from '@/core/bossTypes';
import type { Rng } from '@/core/random';

/**
 * Okrzyki bossa (sprzątaczki, krok 125): kiedy i co krzyczy. Atak z listy `attacks` daje okrzyk od razu (jeśli od
 * poprzedniego minęło `minGapMs`), a cisza dłuższa niż losowe `everyMs` — linię z `idle`. Ta sama linia nie pada
 * dwa razy z rzędu. Czysta logika z własnym RNG; napis i dźwięk daje warstwa gry.
 */
export class ShoutSchedule {
  private lastAt = -Infinity;
  private nextIdleAt = Infinity;
  private lastLine: string | null = null;

  constructor(
    private readonly definition: BossShoutDefinition,
    private readonly rng: Rng,
  ) {}

  /** Początek walki: pierwszy okrzyk „z nudów” po losowym odstępie. */
  start(now: number): void {
    if (Number.isFinite(this.nextIdleAt)) return;
    this.scheduleIdle(now);
  }

  /** Okrzyk na początek ataku `kind` albo null (brak linii albo za wcześnie po poprzednim). */
  onAttack(kind: BossAttackKind, now: number): string | null {
    const lines = this.definition.attacks[kind];
    if (!lines || lines.length === 0 || now - this.lastAt < this.definition.minGapMs) return null;
    return this.say(lines, now);
  }

  /** Okrzyk „z nudów”, gdy przyszła pora; null poza nią. */
  idle(now: number): string | null {
    if (now < this.nextIdleAt) return null;
    if (now - this.lastAt < this.definition.minGapMs) {
      this.scheduleIdle(now);
      return null;
    }
    return this.say(this.definition.idle, now);
  }

  /** Okrzyk wymuszony (ucieczka windą) — liczy się do odstępów. */
  force(line: string, now: number): string {
    this.lastAt = now;
    this.lastLine = line;
    this.scheduleIdle(now);
    return line;
  }

  private say(lines: readonly string[], now: number): string | null {
    if (lines.length === 0) return null;
    const pool = lines.length > 1 ? lines.filter((line) => line !== this.lastLine) : lines;
    const line = pool[this.rng.int(0, pool.length - 1)]!;
    return this.force(line, now);
  }

  private scheduleIdle(now: number): void {
    const { min, max } = this.definition.everyMs;
    this.nextIdleAt = now + min + this.rng.next() * (max - min);
  }
}
