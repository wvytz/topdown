import type { Vector2 } from '@/core/types';

/**
 * Powalenie i wskrzeszanie w co-opie (etap C4, decyzja właściciela): bohater z zerowym HP leży, dopóki partner
 * nie postoi przy nim odpowiednio długo. Odejście cofa postęp powoli, więc krótkie uniki nie przekreślają
 * wskrzeszania. Run kończy się dopiero, gdy padną obaj. Czysta logika, bez Phasera.
 */
export interface ReviveConfig {
  /** Jak blisko powalonego (px świata, środek do środka) musi stać partner. */
  readonly radiusPx: number;
  /** Ile ms stania przy powalonym trwa wskrzeszenie. */
  readonly durationMs: number;
  /** Ile razy wolniej postęp opada, gdy partnera nie ma obok (1 = tak samo szybko jak rośnie). */
  readonly decaySlowdown: number;
  /** Część maksymalnego HP po wskrzeszeniu. */
  readonly hpFraction: number;
}

export interface ReviveInput {
  readonly downed: Vector2;
  /** Żywi partnerzy, którzy mogą wskrzeszać. */
  readonly helpers: readonly Vector2[];
  readonly dtMs: number;
}

/** Postęp wskrzeszania jednego powalonego bohatera. */
export class ReviveProgress {
  private elapsed = 0;

  constructor(private readonly config: ReviveConfig) {}

  /** 0..1 — do paska nad powalonym. */
  get progress(): number {
    return Math.min(1, this.elapsed / this.config.durationMs);
  }

  /** Czy ktoś akurat wskrzesza (do podpowiedzi). */
  isHelped(input: Pick<ReviveInput, 'downed' | 'helpers'>): boolean {
    return input.helpers.some((h) => Math.hypot(h.x - input.downed.x, h.y - input.downed.y) <= this.config.radiusPx);
  }

  /** Zwraca true w klatce, w której bohater wstaje (postęp wraca wtedy do zera). */
  update(input: ReviveInput): boolean {
    const dt = Math.max(0, input.dtMs);
    if (this.isHelped(input)) this.elapsed += dt;
    else this.elapsed = Math.max(0, this.elapsed - dt / Math.max(1, this.config.decaySlowdown));
    if (this.elapsed < this.config.durationMs) return false;
    this.elapsed = 0;
    return true;
  }

  reset(): void {
    this.elapsed = 0;
  }
}

/** HP po wskrzeszeniu: część maksimum, co najmniej 1. */
export function reviveHp(maxHp: number, config: Pick<ReviveConfig, 'hpFraction'>): number {
  return Math.max(1, Math.round(maxHp * config.hpFraction));
}
