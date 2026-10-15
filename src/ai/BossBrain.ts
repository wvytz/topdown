import type { BossAttackPlan, BossDefinition } from '@/core/bossTypes';
import { BossAttackKind, BossPhase, PatternOrder } from '@/core/bossTypes';
import type { Rng } from '@/core/random';
import type { MovementIntent, Vector2 } from '@/core/types';
import { directionTo, distance } from '@/systems/CombatMath';
import { planBossAttack, planFeast } from '@/ai/bossAttacks';
import { AttackPattern } from '@/ai/attackPattern';

export interface BossBrainInput {
  readonly self: Vector2;
  readonly target: Vector2;
  readonly now: number;
  /** Aktualne HP / maks. HP (0..1). */
  readonly hpRatio: number;
  /** Żywe pajączki z wylęgów (Matka Pająków); brak = 0. */
  readonly summonsAlive?: number;
  /** Kokony w spiżarni, które boss może pożreć (Grzybowy Pożeracz); brak = żadnych. */
  readonly larders?: readonly Vector2[];
  /** Paleniska areny (Kat Otchłani). */
  readonly braziers?: readonly Vector2[];
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
 * Boss: uśpiony do wejścia gracza na arenę, potem cyklicznie wykonuje ataki ze wzoru (po kolei albo
 * w lekko losowej kolejności — `patternOrder`, krok 31).
 * W trakcie ataku stoi w miejscu; między atakami powoli podchodzi do gracza.
 * Poniżej progu HP wpada we wściekłość: krótsze telegrafy i przerwy, mocniejsze ataki.
 */
export class BossBrain {
  private phase = BossPhase.Dormant;
  private readonly pattern: AttackPattern;
  private nextAttackAt = Infinity;
  private currentAttack: BossAttackPlan | null = null;
  private nextLashAt = 0;
  private nextHookAt = 0;
  private nextFeastAt = Infinity;
  /** Stosy wzmocnienia z uczt (Grzybowy Pożeracz). */
  private stacks = 0;

  constructor(
    private readonly definition: BossDefinition,
    private readonly rng: Rng,
  ) {
    this.pattern = new AttackPattern(definition.pattern, definition.patternOrder ?? PatternOrder.Fixed, rng);
  }

  get currentPhase(): BossPhase {
    return this.phase;
  }

  activate(now: number): void {
    if (this.phase !== BossPhase.Dormant) return;
    this.phase = BossPhase.Fighting;
    this.nextAttackAt = now + this.definition.openingDelayMs;
    // Hak (Kat) też czeka chwilę po otwarciu walki — gracz najpierw widzi bossa.
    this.nextHookAt = now + this.definition.openingDelayMs / 2;
    if (this.definition.feast) this.nextFeastAt = now + this.definition.feast.firstAfterMs;
  }

  /** Stosy wzmocnienia z uczt. */
  get feastStacks(): number {
    return this.stacks;
  }

  /** Boss zjadł kokon (warstwa gry potwierdza, że kokon jeszcze był) — kolejny stos, do limitu. */
  feasted(): void {
    const feast = this.definition.feast;
    if (feast) this.stacks = Math.min(feast.maxStacks, this.stacks + 1);
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
      const kind = this.pattern.next();
      if (kind !== null) {
        const plan = this.plan(kind, input, enraged);
        const rest = this.definition.restBetweenAttacksMs * (enraged ? this.definition.enrage.restMultiplier : 1);
        this.currentAttack = plan;
        this.nextAttackAt = plan.endsAt + rest;
        return stand(plan);
      }
    }

    // Uczta (Pożeracz, krok 33): gdy przyszła pora, boss idzie do najbliższego kokonu i go pożera.
    const feast = this.definition.feast;
    const larders = input.larders ?? [];
    if (feast && larders.length > 0 && input.now >= this.nextFeastAt) {
      const larder = larders.reduce((best, l) => (distance(input.self, l) < distance(input.self, best) ? l : best));
      if (distance(input.self, larder) <= feast.reach) {
        const plan = planFeast(this.definition, larder, input.now);
        this.currentAttack = plan;
        this.nextFeastAt = plan.endsAt + (enraged ? feast.enragedCooldownMs : feast.cooldownMs);
        this.nextAttackAt = Math.max(this.nextAttackAt, plan.endsAt);
        return stand(plan);
      }
      return { move: directionTo(input.self, larder), speed: this.speedFor(distance(input.self, larder)), newAttack: null, enraged };
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

    // Hak poza wzorem (Kat Otchłani): gracz trzyma dystans — boss przyciąga go pod tarczę.
    const hook = this.definition.hook;
    if (hook && gap >= hook.minRange && gap <= hook.maxRange && input.now >= this.nextHookAt) {
      const plan = this.plan(BossAttackKind.Hook, input, enraged);
      this.currentAttack = plan;
      this.nextHookAt = plan.endsAt + hook.cooldownMs;
      this.nextAttackAt = Math.max(this.nextAttackAt, plan.endsAt);
      return stand(plan);
    }

    if (gap <= this.definition.engageDistance) return stand(null);
    return { move: directionTo(input.self, input.target), speed: this.speedFor(gap), newAttack: null, enraged };
  }

  /** Chód albo sprint (z daleka), przyspieszony stosami uczt. */
  private speedFor(gap: number): number {
    const sprint = this.definition.sprint;
    const base = sprint && gap > sprint.distance ? sprint.speed : this.definition.moveSpeed;
    return base * (1 + this.stacks * (this.definition.feast?.speedPerStack ?? 0));
  }

  /** Plan ataku; stosy uczt zwiększają obrażenia wszystkich stref. */
  private plan(kind: BossAttackKind, input: BossBrainInput, enraged: boolean): BossAttackPlan {
    const plan = this.planRaw(kind, input, enraged);
    const bonus = this.stacks * (this.definition.feast?.damagePerStack ?? 0);
    if (bonus === 0) return plan;
    return { ...plan, strikes: plan.strikes.map((s) => ({ ...s, damage: Math.round(s.damage * (1 + bonus)) })) };
  }

  private planRaw(kind: BossAttackKind, input: BossBrainInput, enraged: boolean): BossAttackPlan {
    return planBossAttack({
      kind,
      definition: this.definition,
      self: input.self,
      target: input.target,
      now: input.now,
      enraged,
      rng: this.rng,
      summonsAlive: input.summonsAlive ?? 0,
      ...(input.braziers && { braziers: input.braziers }),
    });
  }
}
