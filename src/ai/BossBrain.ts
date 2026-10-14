import type { BossAttackPlan, BossDefinition } from '@/core/bossTypes';
import { BossAttackKind, BossPhase } from '@/core/bossTypes';
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
  /** Żywe pajączki z wylęgów (Matka Pająków); brak = 0. */
  readonly summonsAlive?: number;
}

export interface BossDecision {
  readonly move: MovementIntent;
  /** Prędkość ruchu (px/s) — sprint z daleka, chód z bliska. */
  readonly speed: number;
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
  private nextLashAt = 0;

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

  /**
   * Ogłuszenie: odsuwa kolejny atak o `ms`. Atak już rozpisany w czasie (telegrafy widoczne
   * dla gracza) dobiega końca — odsuwamy dopiero następny.
   */
  delay(ms: number): void {
    if (this.phase === BossPhase.Fighting && Number.isFinite(this.nextAttackAt)) this.nextAttackAt += ms;
  }

  think(input: BossBrainInput): BossDecision {
    const enraged = input.hpRatio <= this.definition.enrage.hpThreshold;
    const stand = (newAttack: BossAttackPlan | null): BossDecision => ({ move: STOP, speed: 0, newAttack, enraged });
    if (this.phase === BossPhase.Dormant) return stand(null);

    if (this.currentAttack && input.now < this.currentAttack.endsAt) return stand(null);
    this.currentAttack = null;

    if (input.now >= this.nextAttackAt) {
      const kind = this.definition.pattern[this.patternIndex % this.definition.pattern.length];
      this.patternIndex++;
      if (kind !== undefined) {
        const plan = this.plan(kind, input, enraged);
        const rest = this.definition.restBetweenAttacksMs * (enraged ? this.definition.enrage.restMultiplier : 1);
        this.currentAttack = plan;
        this.nextAttackAt = plan.endsAt + rest;
        return stand(plan);
      }
    }

    // Smagnięcie poza wzorem: gracz w zasięgu nóg i minął odstęp. Atak ze wzoru czeka do końca smagnięcia.
    const gap = distance(input.self, input.target);
    const lash = this.definition.lash;
    if (lash && gap <= lash.triggerRange && input.now >= this.nextLashAt) {
      const plan = this.plan(BossAttackKind.Lash, input, enraged);
      this.currentAttack = plan;
      this.nextLashAt = plan.endsAt + lash.cooldownMs;
      this.nextAttackAt = Math.max(this.nextAttackAt, plan.endsAt);
      return stand(plan);
    }

    if (gap <= this.definition.engageDistance) return stand(null);
    const sprint = this.definition.sprint;
    const speed = sprint && gap > sprint.distance ? sprint.speed : this.definition.moveSpeed;
    return { move: directionTo(input.self, input.target), speed, newAttack: null, enraged };
  }

  private plan(kind: BossAttackKind, input: BossBrainInput, enraged: boolean): BossAttackPlan {
    return planBossAttack({
      kind,
      definition: this.definition,
      self: input.self,
      target: input.target,
      now: input.now,
      enraged,
      rng: this.rng,
      summonsAlive: input.summonsAlive ?? 0,
    });
  }
}
