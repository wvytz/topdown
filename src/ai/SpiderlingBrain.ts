import type { SpiderlingDefinition } from '@/core/bossTypes';
import type { MovementIntent, Vector2 } from '@/core/types';
import { directionTo, distance } from '@/systems/CombatMath';

export enum SpiderlingPhase {
  /** Biegnie do gracza. */
  Chasing = 'chasing',
  /** Krok U8d: przysiad przed skokiem (telegraf) — stoi i patrzy na bohatera. */
  Crouching = 'crouching',
  /** Krok U8d: lot w zapamiętane miejsce bohatera; po lądowaniu zapłon. */
  Leaping = 'leaping',
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
  /** Mnożnik prędkości ruchu (skok — szybciej); brak = 1. */
  readonly speedMultiplier?: number;
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
  /** Koniec przysiadu albo lotu (krok U8d). */
  private leapPhaseEndsAt = Infinity;
  /** Miejsce skoku: bohater w chwili wybicia. */
  private leapTarget: Vector2 | null = null;

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
    const prime = (): void => {
      this.phase = SpiderlingPhase.Priming;
      this.explodeAt = now + this.definition.primeMs;
      primeStarted = true;
    };
    const leap = this.definition.leap;
    if (this.phase === SpiderlingPhase.Chasing) {
      const dist = distance(self, target);
      if (dist <= this.definition.primeRange || now - this.bornAt >= this.definition.fuseMs) prime();
      else if (leap && dist <= leap.range) {
        // Krok U8d: z bliska przysiad, potem skok — bohater widzi drgnięcie i ma chwilę na unik.
        this.phase = SpiderlingPhase.Crouching;
        this.leapPhaseEndsAt = now + leap.windupMs;
      }
    }
    if (this.phase === SpiderlingPhase.Crouching && leap) {
      if (now < this.leapPhaseEndsAt) return { move: STOP, phase: this.phase, explode: false, primeStarted };
      this.phase = SpiderlingPhase.Leaping;
      this.leapTarget = { x: target.x, y: target.y };
      this.leapPhaseEndsAt = now + leap.durationMs;
    }
    if (this.phase === SpiderlingPhase.Leaping && leap) {
      const aim = this.leapTarget ?? target;
      // Ląduje po czasie lotu, w zapamiętanym miejscu albo przy bohaterze — i od razu zapala lont.
      if (now >= this.leapPhaseEndsAt || distance(self, aim) <= this.definition.radius || distance(self, target) <= this.definition.primeRange) prime();
      else return { move: directionTo(self, aim), phase: this.phase, explode: false, primeStarted, speedMultiplier: leap.speedMultiplier };
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
