import type { SpiderlingDefinition } from '@/core/bossTypes';
import type { IntRange } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';

/** Kokony w Pajęczym leżu (krok 23d). Liczby w biomeConfig. */
export interface CocoonConfig {
  /** Ile kokonów w zwykłym pokoju (losowane; 0 = pokój bez kokonów). */
  readonly perRoom: IntRange;
  /** Odstęp od ścian pokoju (kafle) — kokon nie stoi w przejściu. */
  readonly wallMarginTiles: number;
  /** Środek pokoju (promień w kaflach) zostaje wolny — tam może stać kapliczka. */
  readonly centerClearTiles: number;
  /** Najmniejszy odstęp między kokonami (kafle, metryka Czebyszewa). */
  readonly minSpacingTiles: number;
  /** Promień kokonu (px): trafienia ciosem, strzałem i dashem. */
  readonly radius: number;
  /** Gracz bliżej niż tyle (px, od środka do środka) budzi kokon. */
  readonly triggerRadius: number;
  /** Czas od zbudzenia do wybuchu (telegraf: kokon drży, widać strefę). */
  readonly fuseMs: number;
  /** Strefa spowolnienia przy wybuchu (px). */
  readonly blastRadius: number;
  readonly slow: { readonly pct: number; readonly durationMs: number };
  /** Ile pajączków-kamikaze wypuszcza wybuch … */
  readonly spiderlings: number;
  /** … i jakich (te same co z wylęgu Matki Pająków; obrażenia skaluje warstwa gry). */
  readonly spiderling: SpiderlingDefinition;
}

export enum CocoonPhase {
  Dormant = 'dormant',
  Fusing = 'fusing',
  Burst = 'burst',
}

/**
 * Stan jednego kokonu: śpi, aż gracz podejdzie (wtedy po `fuseMs` wybucha) albo go trafi
 * (wybucha od razu). Wybucha tylko raz. Czas jawnie (`now`, ms).
 * Ten sam zapalnik mają purchawki Grzybni (krok 28c).
 */
export class CocoonState {
  private phase = CocoonPhase.Dormant;
  private fuseEndsAt = Infinity;

  constructor(private readonly config: Pick<CocoonConfig, 'triggerRadius' | 'fuseMs'>) {}

  get currentPhase(): CocoonPhase {
    return this.phase;
  }

  /** Chwila wybuchu po zbudzeniu (Infinity, gdy kokon śpi) — do rysowania telegrafu. */
  get burstAt(): number {
    return this.fuseEndsAt;
  }

  /** Klatka gry; zwraca true dokładnie raz — w chwili wybuchu. */
  update(self: Vector2, player: Vector2 | null, now: number): boolean {
    if (this.phase === CocoonPhase.Dormant && player && Math.hypot(player.x - self.x, player.y - self.y) <= this.config.triggerRadius) {
      this.phase = CocoonPhase.Fusing;
      this.fuseEndsAt = now + this.config.fuseMs;
    }
    if (this.phase === CocoonPhase.Fusing && now >= this.fuseEndsAt) {
      this.phase = CocoonPhase.Burst;
      return true;
    }
    return false;
  }

  /** Trafienie (cios, strzał, dash) rozrywa kokon od razu; zwraca true, jeśli właśnie wybuchł. */
  hit(now: number): boolean {
    if (this.phase === CocoonPhase.Burst) return false;
    this.phase = CocoonPhase.Burst;
    this.fuseEndsAt = now;
    return true;
  }
}

/** Czy wybuch kokonu łapie gracza (strefa styka się z jego ciałem). */
export function cocoonBlastCatches(center: Vector2, blastRadius: number, player: Vector2, playerRadius: number): boolean {
  return Math.hypot(player.x - center.x, player.y - center.y) <= blastRadius + playerRadius;
}
