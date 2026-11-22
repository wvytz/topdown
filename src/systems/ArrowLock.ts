/**
 * Blokada celu łucznika (krok U12d) — czysta logika: który cel trzyma strzały i w którą stronę lecą.
 * Phaser (HeroCombat) tylko zgłasza trafienia i podaje punkt strzału; tu nie ma silnika.
 */
import type { Vector2 } from '@/core/types';
import { distance, normalize, wrapAngle } from '@/systems/CombatMath';
import type { AimTarget } from '@/systems/touchAim';

/** Cel blokady: pozycja, promień i flagi życia (boss i elita to obiekty Phasera, ale tu liczy się tylko ten kształt). */
export interface LockCandidate extends AimTarget {
  readonly isDead: boolean;
  readonly active: boolean;
}

export interface ArrowLockSettings {
  readonly releaseRange: number;
  readonly manualConeDeg: number;
}

/** Skąd pochodzi kierunek celowania: sam (stuknięcie, przytrzymanie na dotyku) albo ręka gracza (mysz, pad, przeciągnięcie). */
export type AimSource = 'auto' | 'manual';

export class ArrowLock<T extends LockCandidate> {
  private current: T | null = null;
  private rank = 0;

  /** Zablokowany cel albo null (martwy cel jest zwalniany przy najbliższym odczycie). */
  get target(): T | null {
    this.dropIfGone();
    return this.current;
  }

  /** Trafienie celu: zakłada blokadę, gdy jej nie ma, albo przenosi ją na cel o wyższej randze (boss nad elitą). */
  hit(target: T, rank: number): void {
    this.dropIfGone();
    if (this.current === null || rank > this.rank) {
      this.current = target;
      this.rank = rank;
    }
  }

  clear(): void {
    this.current = null;
    this.rank = 0;
  }

  /**
   * Kierunek strzału z uwzględnieniem blokady: wektor jednostkowy w stronę celu albo null, gdy strzał ma zostać
   * tam, gdzie celuje gracz (brak blokady, cel poza zasięgiem, celowanie ręczne poza stożkiem).
   */
  steer(origin: Vector2, aim: Vector2, source: AimSource, settings: ArrowLockSettings): Vector2 | null {
    const target = this.target;
    if (!target) return null;
    const dist = distance(origin, target);
    if (dist > settings.releaseRange) {
      this.clear();
      return null;
    }
    if (dist < 1) return null;
    const toTarget = normalize({ x: target.x - origin.x, y: target.y - origin.y });
    if (source === 'manual') {
      const away = Math.abs(wrapAngle(Math.atan2(aim.y, aim.x) - Math.atan2(toTarget.y, toTarget.x)));
      const allowed = (settings.manualConeDeg * Math.PI) / 180 + Math.atan2(target.radius, dist);
      if (away > allowed) return null;
    }
    return toTarget;
  }

  private dropIfGone(): void {
    if (this.current && (this.current.isDead || !this.current.active)) this.clear();
  }
}
