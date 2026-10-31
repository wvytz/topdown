import type { StormTrailEffect } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';

export interface StormTrailPoint {
  readonly at: Vector2;
  readonly expiresAt: number;
}

/**
 * Ślad burzy (krok 150, Burzowy pęd ×3): dash zostawia punkty co `spacing` px; ślad żyje `durationMs`
 * i co `tickMs` rani wrogów w promieniu każdego punktu. Czysta logika — rysuje i rani `HeroCombat`.
 */
export class StormTrail {
  private points: StormTrailPoint[] = [];
  private last: Vector2 | null = null;
  private nextTickAt = -Infinity;

  get alive(): readonly StormTrailPoint[] {
    return this.points;
  }

  /** Bohater w dashu w `at`; `dashing` false kończy odcinek (kolejny dash zaczyna nowy). */
  track(at: Vector2, dashing: boolean, now: number, effect: StormTrailEffect): void {
    this.points = this.points.filter((point) => point.expiresAt > now);
    if (!dashing) {
      this.last = null;
      return;
    }
    const from = this.last ?? at;
    const length = Math.hypot(at.x - from.x, at.y - from.y);
    const steps = this.last ? Math.floor(length / effect.spacing) : 0;
    if (!this.last) this.points.push({ at: { x: at.x, y: at.y }, expiresAt: now + effect.durationMs });
    for (let i = 1; i <= steps; i++) {
      const t = (i * effect.spacing) / length;
      this.points.push({ at: { x: from.x + (at.x - from.x) * t, y: from.y + (at.y - from.y) * t }, expiresAt: now + effect.durationMs });
    }
    if (!this.last || steps > 0) {
      const lastPoint = this.points.at(-1);
      this.last = lastPoint ? lastPoint.at : { x: at.x, y: at.y };
    }
  }

  /** Punkty, które w tej klatce ranią (raz na `tickMs`); pusta lista między tyknięciami. */
  strike(now: number, effect: StormTrailEffect): readonly StormTrailPoint[] {
    if (this.points.length === 0 || now < this.nextTickAt) return [];
    this.nextTickAt = now + effect.tickMs;
    return this.points;
  }
}
