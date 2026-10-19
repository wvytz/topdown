import Phaser from 'phaser';
import type { BossDogDefinition } from '@/core/bossTypes';
import type { DamageResult, Hit } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import type { DogDecision } from '@/ai/BossDogBrain';
import { BossDogBrain, DogPhase } from '@/ai/BossDogBrain';
import { DOG_VISUAL, SPRITE_SHEETS } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { DirectionalAnimator } from '@/entities/DirectionalAnimator';
import { attachGroundShadow } from '@/effects/GroundShadow';
import { Health } from '@/systems/Health';
import type { MeleeTarget } from '@/systems/MeleeResolver';
import { Timer } from '@/systems/Timer';

const HIT_FLASH_MS = 70;

/**
 * Dog Barona (krok 83) — osobny boss-pomocnik. Decyzje podejmuje BossDogBrain; kłapnięcia i obrażenia skoku
 * rozstrzyga BossFight. Każde trafienie gracza go rani (ma własne HP), ale nie przesuwa — pies jest ciężki.
 */
export class BossDog extends Phaser.Physics.Arcade.Sprite implements MeleeTarget {
  readonly definition: BossDogDefinition;
  readonly health: Health;
  private readonly brain: BossDogBrain;
  private readonly animator: DirectionalAnimator;
  private readonly hitFlash = new Timer();
  /** Skok już trafił gracza (jedno trafienie na skok). */
  lungeHit = false;

  constructor(scene: Phaser.Scene, x: number, y: number, definition: BossDogDefinition) {
    super(scene, x, y, SPRITE_SHEETS[DOG_VISUAL.sheet].key);
    this.definition = definition;
    this.health = new Health(definition.maxHp);
    this.brain = new BossDogBrain(definition);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCircle(definition.radius, this.width / 2 - definition.radius, this.height / 2 - definition.radius);
    this.setImmovable(true);
    this.setPushable(false);
    this.setDepth(RENDER_DEPTH.enemy);
    this.animator = new DirectionalAnimator(this, DOG_VISUAL.sheet);
    attachGroundShadow(this, DOG_VISUAL.groundShadow);
    this.animator.play(DOG_VISUAL.idle);
  }

  get radius(): number {
    return this.definition.radius;
  }

  get isDead(): boolean {
    return this.health.isDead;
  }

  get phase(): DogPhase {
    return this.brain.phase;
  }

  /** Odstęp przed pierwszym skokiem po wejściu do walki (i po powrocie z martwych). */
  armSummonCooldown(now: number): void {
    this.brain.reset(now);
  }

  /** Smuga dymu trafiła gracza i dog jest gotowy do skoku. */
  canSummon(now: number): boolean {
    return !this.isDead && this.brain.canSummon(now);
  }

  /** Dog znika z boku Barona i wypada z rogu widoku (`corner`): przysiad, zablokowany kierunek, szarża. */
  summonFrom(corner: Vector2, now: number): void {
    if (this.body instanceof Phaser.Physics.Arcade.Body) this.body.reset(corner.x, corner.y);
    this.lungeHit = false;
    this.brain.summon(now);
  }

  /** Kierunek zablokowanego skoku (null przed zablokowaniem) i chwila wybicia — telegraf. */
  get lungeAim(): { readonly direction: Vector2 | null; readonly launchAt: number } | null {
    return this.brain.phase === DogPhase.Telegraph ? { direction: this.brain.lockedDirection, launchAt: this.brain.lungeLaunchAt } : null;
  }

  tick(boss: Vector2, target: Vector2, now: number): DogDecision {
    const decision = this.brain.think({ self: { x: this.x, y: this.y }, boss, target, now });
    this.setVelocity(decision.move.x * decision.speed, decision.move.y * decision.speed);
    if (decision.move.x !== 0 || decision.move.y !== 0) this.animator.face(decision.move);
    else if (decision.phase === DogPhase.Telegraph || decision.phase === DogPhase.Bite) this.animator.face({ x: target.x - this.x, y: target.y - this.y });
    switch (decision.phase) {
      case DogPhase.Lunge:
        this.animator.play(DOG_VISUAL.lunge);
        break;
      case DogPhase.Bite:
        this.animator.play(DOG_VISUAL.lunge);
        break;
      case DogPhase.Telegraph:
      case DogPhase.Recover:
        this.animator.play(DOG_VISUAL.idle);
        break;
      default:
        this.animator.play(decision.speed > 0 ? DOG_VISUAL.move : DOG_VISUAL.idle);
    }
    if (this.hitFlash.isActive(now)) this.setTintFill(0xffffff);
    else this.clearTint();
    return decision;
  }

  takeHit(hit: Hit, now: number, _source: Vector2): DamageResult {
    this.hitFlash.start(now, HIT_FLASH_MS);
    return this.health.takeDamage(hit.damage);
  }
}
