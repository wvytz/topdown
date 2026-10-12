import type { BossAttackPlan, BossDefinition } from '@/core/bossTypes';
import { BossPhase } from '@/core/bossTypes';
import type { Rng } from '@/core/random';
import type { MovementIntent, Vector2 } from '@/core/types';
import { directionTo, distance } from '@/systems/CombatMath';
import { planBossAttack } from '@/ai/bossAttacks';

export interface BossBrainInput {
  readonly self: Vector2;
  readonly target: Vector2;
  readonly now: number;
  /** Aktualne HP / maks. HP (0..1). */
  readonly hpRatio: number;
}

export interface BossDecision {
  readonly move: MovementIntent;
  /** Nowy atak do wykonania (tylko w klatce, w której się zaczyna). */
  readonly newAttack: BossAttackPlan | null;
  readonly enraged: boolean;
}

const STOP: MovementIntent = { x: 0, y: 0 };

/**
 * Boss: uśpiony do wejścia gracza na arenę, potem cyklicznie wykonuje sekwencję ataków.
 * W trakcie ataku stoi w miejscu; między atakami powoli podchodzi do gracza.
 * Poniżej progu HP wpada we wściekłość: krótsze telegrafy i przerwy, mocniejsze ataki.
 */
export class BossBrain {
  private phase = BossPhase.Dormant;
  private patternIndex = 0;
  private nextAttackAt = Infinity;
  private currentAttack: BossAttackPlan | null = null;

  constructor(
    private readonly definition: BossDefinition,
    private readonly rng: Rng,
  ) {}

  get currentPhase(): BossPhase {
    return this.phase;
  }

  activate(now: number): void {
    if (this.phase !== BossPhase.Dormant) return;
    this.phase = BossPhase.Fighting;
    this.nextAttackAt = now + this.definition.openingDelayMs;
  }

  think(input: BossBrainInput): BossDecision {
    const enraged = input.hpRatio <= this.definition.enrage.hpThreshold;
    if (this.phase === BossPhase.Dormant) return { move: STOP, newAttack: null, enraged };

    if (this.currentAttack && input.now < this.currentAttack.endsAt) {
      return { move: STOP, newAttack: null, enraged };
    }
    this.currentAttack = null;

    if (input.now >= this.nextAttackAt) {
      const kind = this.definition.pattern[this.patternIndex % this.definition.pattern.length];
      this.patternIndex++;
      if (kind !== undefined) {
        const plan = planBossAttack({
          kind,
          definition: this.definition,
          self: input.self,
          target: input.target,
          now: input.now,
          enraged,
          rng: this.rng,
        });
        const rest = this.definition.restBetweenAttacksMs * (enraged ? this.definition.enrage.restMultiplier : 1);
        this.currentAttack = plan;
        this.nextAttackAt = plan.endsAt + rest;
        return { move: STOP, newAttack: plan, enraged };
      }
    }

    const move =
      distance(input.self, input.target) > this.definition.engageDistance
        ? directionTo(input.self, input.target)
        : STOP;
    return { move, newAttack: null, enraged };
  }
}
