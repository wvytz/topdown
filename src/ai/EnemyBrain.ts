import type { EnemyBehaviour } from '@/core/combatTypes';
import { AttackPhase, EnemyState } from '@/core/combatTypes';
import type { MovementIntent, Vector2 } from '@/core/types';
import { directionTo, distance } from '@/systems/CombatMath';

export interface BrainInput {
  readonly self: Vector2;
  readonly target: Vector2;
  readonly canSeeTarget: boolean;
  readonly attackPhase: AttackPhase;
}

export interface BrainDecision {
  readonly state: EnemyState;
  readonly move: MovementIntent;
  readonly startAttack: boolean;
}

const STOP: MovementIntent = { x: 0, y: 0 };
/** Odległość (px), przy której uznajemy, że dotarliśmy do ostatniej znanej pozycji gracza. */
const ARRIVAL_DISTANCE = 8;

/**
 * Maszyna stanów AI: IDLE → CHASE → ATTACK. Czysta logika — zwraca decyzję,
 * a encja Phasera ją wykonuje.
 * Po utracie linii wzroku przeciwnik idzie do ostatniej znanej pozycji gracza, potem wraca do IDLE.
 */
export class EnemyBrain {
  private state = EnemyState.Idle;
  private lastKnownTarget: Vector2 | null = null;

  constructor(
    private readonly behaviour: EnemyBehaviour,
    private readonly attackRange: number,
  ) {}

  get currentState(): EnemyState {
    return this.state;
  }

  /** Np. po otrzymaniu trafienia — przeciwnik „słyszy” źródło i rusza w pościg. */
  alert(position: Vector2): void {
    this.lastKnownTarget = position;
    if (this.state === EnemyState.Idle) this.state = EnemyState.Chase;
  }

  think(input: BrainInput): BrainDecision {
    const dist = distance(input.self, input.target);

    if (input.canSeeTarget && (this.state !== EnemyState.Idle || dist <= this.behaviour.aggroRange)) {
      this.lastKnownTarget = input.target;
      this.state = dist <= this.attackRange ? EnemyState.Attack : EnemyState.Chase;
    } else if (this.state !== EnemyState.Idle) {
      this.state = EnemyState.Chase;
    }

    // W trakcie zamachu stoimy w miejscu — to telegraf dla gracza.
    if (input.attackPhase === AttackPhase.Windup) {
      return { state: this.state, move: STOP, startAttack: false };
    }

    switch (this.state) {
      case EnemyState.Idle:
        return { state: this.state, move: STOP, startAttack: false };
      case EnemyState.Chase: {
        const move = this.chase(input.self); // może przełączyć stan na IDLE
        return { state: this.state, move, startAttack: false };
      }
      case EnemyState.Attack:
        return {
          state: this.state,
          move: this.positionForAttack(input.self, input.target, dist),
          startAttack: input.attackPhase === AttackPhase.Ready,
        };
    }
  }

  private chase(self: Vector2): MovementIntent {
    if (!this.lastKnownTarget) {
      this.state = EnemyState.Idle;
      return STOP;
    }
    if (distance(self, this.lastKnownTarget) <= ARRIVAL_DISTANCE) {
      this.lastKnownTarget = null;
      this.state = EnemyState.Idle;
      return STOP;
    }
    return directionTo(self, this.lastKnownTarget);
  }

  private positionForAttack(self: Vector2, target: Vector2, dist: number): MovementIntent {
    const kiting = this.behaviour.kiting;
    if (!kiting) return STOP;
    const toward = directionTo(self, target);
    if (dist < kiting.retreatRange) return { x: -toward.x, y: -toward.y };
    if (dist > kiting.preferredRange) return toward;
    return STOP;
  }
}
