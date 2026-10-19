import type { BossDogDefinition } from '@/core/bossTypes';
import type { MovementIntent, Vector2 } from '@/core/types';
import { directionTo, distance } from '@/systems/CombatMath';

export enum DogPhase {
  /** U boku Barona: warczy i pilnuje go. */
  Heel = 'heel',
  /** Przysiad w rogu widoku przed skokiem (kierunek blokuje się tuż przed wybiciem). */
  Telegraph = 'telegraph',
  /** Szarża w zablokowanym kierunku. */
  Lunge = 'lunge',
  /** Po skoku: stoi (okno na kontrę). */
  Recover = 'recover',
  /** Goni gracza. */
  Chase = 'chase',
  /** Kłapnięcie: telegraf strefy, uderzenie, chwila przerwy. */
  Bite = 'bite',
}

/** Kłapnięcie w planie — strefa przed psem (jak `AreaStrike`, ale bez pól bossa). */
export interface DogBite {
  readonly center: Vector2;
  readonly radius: number;
  readonly telegraphStartAt: number;
  readonly impactAt: number;
  readonly damage: number;
  readonly knockback: number;
}

export interface DogInput {
  readonly self: Vector2;
  /** Pozycja Barona (pies trzyma się jego boku). */
  readonly boss: Vector2;
  readonly target: Vector2;
  readonly now: number;
}

export interface DogDecision {
  readonly move: MovementIntent;
  readonly speed: number;
  readonly phase: DogPhase;
  /** Nowe kłapnięcie (tylko w klatce, w której się zaczyna). */
  readonly newBite: DogBite | null;
}

const STOP: MovementIntent = { x: 0, y: 0 };

/**
 * Dog Barona: u boku Barona, po trafieniu smugą dymu wypada z rogu widoku (skok), potem goni i gryzie.
 * Czysta logika — pozycję startową skoku (róg) wybiera i ustawia warstwa gry przed `summon`.
 */
export class BossDogBrain {
  private current = DogPhase.Heel;
  private phaseEndsAt = 0;
  private launchAt = 0;
  private lockAt = 0;
  private lungeDir: Vector2 | null = null;
  private bite: DogBite | null = null;
  /** Najwcześniejsza chwila, w której smuga może znów przywołać doga. */
  private nextSummonAt = 0;

  constructor(private readonly definition: BossDogDefinition) {}

  get phase(): DogPhase {
    return this.current;
  }

  /** Kierunek zablokowanego skoku (null przed zablokowaniem) — do rysowania telegrafu. */
  get lockedDirection(): Vector2 | null {
    return this.lungeDir;
  }

  /** Chwila wybicia do skoku — do rysowania telegrafu. */
  get lungeLaunchAt(): number {
    return this.launchAt;
  }

  /** Smuga trafiła gracza: dog jest gotowy do skoku z rogu (nie w trakcie skoku, nie przed końcem odstępu). */
  canSummon(now: number): boolean {
    return (this.current === DogPhase.Heel || this.current === DogPhase.Chase) && now >= this.nextSummonAt;
  }

  /** Zaczyna skok z miejsca, w którym warstwa gry już postawiła doga (róg widoku). */
  summon(now: number): void {
    const { lunge } = this.definition;
    this.current = DogPhase.Telegraph;
    this.launchAt = now + lunge.telegraphMs;
    this.lockAt = this.launchAt - lunge.lockBeforeMs;
    this.phaseEndsAt = this.launchAt;
    this.lungeDir = null;
    this.bite = null;
  }

  /** Dog zabity i wrócił do boku (po `respawnMs`): zaczyna od nowa. */
  reset(now: number): void {
    this.current = DogPhase.Heel;
    this.lungeDir = null;
    this.bite = null;
    this.nextSummonAt = now + this.definition.summonCooldownMs;
  }

  think(input: DogInput): DogDecision {
    const { self, boss, target, now } = input;
    const stand = (newBite: DogBite | null = null): DogDecision => ({ move: STOP, speed: 0, phase: this.current, newBite });

    switch (this.current) {
      case DogPhase.Telegraph: {
        if (this.lungeDir === null && now >= this.lockAt) this.lungeDir = directionTo(self, target);
        if (now < this.launchAt) return stand();
        this.lungeDir ??= directionTo(self, target);
        this.current = DogPhase.Lunge;
        this.phaseEndsAt = now + this.definition.lunge.durationMs;
        return { move: this.lungeDir, speed: this.definition.lunge.speed, phase: this.current, newBite: null };
      }
      case DogPhase.Lunge: {
        if (now < this.phaseEndsAt && this.lungeDir) {
          return { move: this.lungeDir, speed: this.definition.lunge.speed, phase: this.current, newBite: null };
        }
        this.current = DogPhase.Recover;
        this.phaseEndsAt = now + this.definition.lunge.recoveryMs;
        return stand();
      }
      case DogPhase.Recover: {
        if (now < this.phaseEndsAt) return stand();
        this.current = DogPhase.Chase;
        this.nextSummonAt = now + this.definition.summonCooldownMs;
        return this.chase(self, target, now);
      }
      case DogPhase.Bite: {
        if (now < this.phaseEndsAt) return stand();
        this.current = DogPhase.Chase;
        this.bite = null;
        return this.chase(self, target, now);
      }
      case DogPhase.Chase:
        return this.chase(self, target, now);
      case DogPhase.Heel:
        return this.heel(self, boss, target, now);
    }
  }

  /** U boku: trzyma miejsce obok Barona (z boku względem linii boss → gracz); gracz za blisko = pościg. */
  private heel(self: Vector2, boss: Vector2, target: Vector2, now: number): DogDecision {
    if (distance(self, target) <= this.definition.guardRange) {
      this.current = DogPhase.Chase;
      return this.chase(self, target, now);
    }
    const toPlayer = directionTo(boss, target);
    const slot = { x: boss.x - toPlayer.y * this.definition.heelDistance, y: boss.y + toPlayer.x * this.definition.heelDistance };
    if (distance(self, slot) <= 6) return { move: STOP, speed: 0, phase: this.current, newBite: null };
    return { move: directionTo(self, slot), speed: this.definition.moveSpeed, phase: this.current, newBite: null };
  }

  private chase(self: Vector2, target: Vector2, now: number): DogDecision {
    const { bite } = this.definition;
    const gap = distance(self, target);
    if (gap <= bite.triggerRange) {
      const dir = directionTo(self, target);
      this.bite = {
        center: { x: self.x + dir.x * bite.reach, y: self.y + dir.y * bite.reach },
        radius: bite.radius,
        telegraphStartAt: now,
        impactAt: now + bite.telegraphMs,
        damage: bite.damage,
        knockback: bite.knockback,
      };
      this.current = DogPhase.Bite;
      this.phaseEndsAt = this.bite.impactAt + bite.recoveryMs;
      return { move: STOP, speed: 0, phase: this.current, newBite: this.bite };
    }
    return { move: directionTo(self, target), speed: this.definition.moveSpeed, phase: this.current, newBite: null };
  }
}
