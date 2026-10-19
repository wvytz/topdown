import type { Vector2 } from '@/core/types';

/**
 * Pies przegryzający się przez ścianę (krok 84, Zadymiona palarnia). Liczby w biomeConfig.
 * W zwykłym pokoju (z szansą) na licu muru jest ledwo widoczna rysa; gdy gracz zbliży się do niej na
 * `triggerRadius`, mur pęka przez `crackMs` (telegraf), a potem wypada z niego wielki czarny dog.
 */
export interface WallDogConfig {
  /** Szansa, że dany zwykły pokój ma psa w ścianie. */
  readonly roomChance: number;
  /** Pokoje z krótszym bokiem poniżej tego (kafle) nie mają psa — gracz nie ma gdzie się cofnąć. */
  readonly minShortSide: number;
  /** Najwyżej tyle psów na piętrze. */
  readonly maxPerFloor: number;
  /** Gracz bliżej niż tyle (px, od środka kafla muru) budzi psa. */
  readonly triggerRadius: number;
  /** Czas pękania muru przed wypadnięciem psa (telegraf). */
  readonly crackMs: number;
}

export enum WallDogPhase {
  /** Rysa w murze, pies śpi. */
  Dormant = 'dormant',
  /** Mur pęka — zaraz wypadnie pies. */
  Cracking = 'cracking',
  /** Dziura gotowa, pies na wolności. */
  Burst = 'burst',
}

/** Zapalnik jednego psa w ścianie. */
export class WallDogState {
  private current = WallDogPhase.Dormant;
  private burstTime = Infinity;

  constructor(private readonly config: Pick<WallDogConfig, 'triggerRadius' | 'crackMs'>) {}

  get phase(): WallDogPhase {
    return this.current;
  }

  /** Chwila wypadnięcia psa (Infinity, gdy śpi). */
  get burstAt(): number {
    return this.burstTime;
  }

  /** Postęp pękania 0..1 (0 przed budzeniem, 1 po wypadnięciu psa). */
  crackProgress(now: number): number {
    if (this.current === WallDogPhase.Dormant) return 0;
    if (this.current === WallDogPhase.Burst) return 1;
    return Math.min(1, Math.max(0, 1 - (this.burstTime - now) / this.config.crackMs));
  }

  /** Klatka gry; true dokładnie w klatce, w której pies wypada ze ściany. */
  update(wall: Vector2, player: Vector2 | null, now: number): boolean {
    if (this.current === WallDogPhase.Dormant) {
      if (player && Math.hypot(player.x - wall.x, player.y - wall.y) <= this.config.triggerRadius) {
        this.current = WallDogPhase.Cracking;
        this.burstTime = now + this.config.crackMs;
      }
      return false;
    }
    if (this.current === WallDogPhase.Cracking && now >= this.burstTime) {
      this.current = WallDogPhase.Burst;
      return true;
    }
    return false;
  }
}
