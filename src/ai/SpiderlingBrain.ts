import type { SpiderlingDefinition } from '@/core/bossTypes';
import type { MovementIntent, Vector2 } from '@/core/types';
import { directionTo, distance } from '@/systems/CombatMath';

export enum SpiderlingPhase {
  /** Biegnie do gracza. */
  Chasing = 'chasing',
  /** Zapłon: stoi i świeci (telegraf), potem wybucha. */
  Priming = 'priming',
  /** Wybuchł — warstwa Phasera zadaje obrażenia i usuwa pajączka. */
  Exploded = 'exploded',
}

export interface SpiderlingDecision {
  readonly move: MovementIntent;
  readonly phase: SpiderlingPhase;
  /** true dokładnie w klatce wybuchu. */
  readonly explode: boolean;
  /** Zapłon właśnie się zaczął (warstwa widoku startuje animację i telegraf). */
  readonly primeStarted: boolean;
}

const STOP: MovementIntent = { x: 0, y: 0 };

/**
 * Pajączek-kamikaze z wylęgu Matki Pająków: biegnie do gracza; zapłon zaczyna się przy graczu
 * (`primeRange`) albo po `fuseMs` od wylęgu — wybucha „po chwili”, nawet jeśli nie dobiegł.
 * Zapłon trwa `primeMs`, potem wybuch. Zabity wcześniej nie wybucha (to rozstrzyga warstwa walki).
 */
export class SpiderlingBrain {
  private phase = SpiderlingPhase.Chasing;
  private explodeAt = Infinity;

  constructor(
    private readonly definition: SpiderlingDefinition,
    private readonly bornAt: number,
  ) {}

  get currentPhase(): SpiderlingPhase {
    return this.phase;
  }

  /** Chwila wybuchu (Infinity przed zapłonem). */
  get explosionAt(): number {
    return this.explodeAt;
  }

  think(self: Vector2, target: Vector2, now: number): SpiderlingDecision {
    if (this.phase === SpiderlingPhase.Exploded) {
      return { move: STOP, phase: this.phase, explode: false, primeStarted: false };
    }

    let primeStarted = false;
    if (this.phase === SpiderlingPhase.Chasing) {
      const close = distance(self, target) <= this.definition.primeRange;
      if (close || now - this.bornAt >= this.definition.fuseMs) {
        this.phase = SpiderlingPhase.Priming;
        this.explodeAt = now + this.definition.primeMs;
        primeStarted = true;
      }
    }

    if (this.phase === SpiderlingPhase.Priming) {
      if (now >= this.explodeAt) {
        this.phase = SpiderlingPhase.Exploded;
        return { move: STOP, phase: this.phase, explode: true, primeStarted };
      }
      return { move: STOP, phase: this.phase, explode: false, primeStarted };
    }

    return { move: directionTo(self, target), phase: this.phase, explode: false, primeStarted };
  }
}
