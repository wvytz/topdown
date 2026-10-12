import Phaser from 'phaser';
import type {
  DamageResult,
  EnemyDefinition,
  Hit,
  MeleeAttackDefinition,
  ProjectileAttackDefinition,
} from '@/core/combatTypes';
import { AttackPhase, EnemyAttackKind, EnemyType } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { EnemyBrain } from '@/ai/EnemyBrain';
import { ENEMY_STATUS_RESISTANCE } from '@/config/combatConfig';
import { AttackCycle } from '@/systems/AttackCycle';
import { Health } from '@/systems/Health';
import { StatusEffects } from '@/systems/StatusEffects';
import { Timer } from '@/systems/Timer';
import { statusTint } from '@/effects/statusTints';

/** Wykonawca ataków — encja decyduje *kiedy*, a menedżer rozstrzyga *kogo* trafia. */
export interface EnemyAttackHandler {
  meleeStrike(enemy: Enemy, attack: MeleeAttackDefinition): void;
  fireProjectile(enemy: Enemy, attack: ProjectileAttackDefinition, target: Vector2): void;
}

export interface EnemyPerception {
  readonly target: Vector2;
  readonly canSeeTarget: boolean;
}

const HIT_STUN_MS = 150;
const HIT_FLASH_MS = 80;
const WINDUP_TINT = 0xffb347;

export function enemyTextureKey(type: EnemyType): string {
  return `tex-enemy-${type}`;
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly definition: EnemyDefinition;
  readonly health: Health;

  private readonly brain: EnemyBrain;
  private readonly attackCycle: AttackCycle;
  private readonly hitStun = new Timer();
  private readonly hitFlash = new Timer();
  readonly status = new StatusEffects(ENEMY_STATUS_RESISTANCE);

  constructor(scene: Phaser.Scene, x: number, y: number, definition: EnemyDefinition) {
    super(scene, x, y, enemyTextureKey(definition.type));
    this.definition = definition;
    this.health = new Health(definition.maxHp);
    this.brain = new EnemyBrain(definition.behaviour, definition.attack.range);
    this.attackCycle = new AttackCycle(definition.attack.windupMs, definition.attack.cooldownMs);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCircle(definition.radius);
    this.setDepth(9);
  }

  get radius(): number {
    return this.definition.radius;
  }

  get isDead(): boolean {
    return this.health.isDead;
  }

  /** Obrażenia od podpalenia należne do `now`; śmierć od ognia wykrywa menedżer po `isDead`. */
  tickBurn(now: number): number {
    const damage = this.status.takeBurnDamage(now);
    if (damage > 0 && !this.isDead) {
      this.health.takeDamage(damage);
      this.hitFlash.start(now, HIT_FLASH_MS);
    }
    return damage;
  }

  tick(perception: EnemyPerception, now: number, handler: EnemyAttackHandler): void {
    if (this.isDead) return;

    if (this.status.isStunned(now)) {
      this.attackCycle.interrupt();
      if (!this.hitStun.isActive(now)) this.setVelocity(0, 0);
      this.updateTint(now);
      return;
    }

    if (this.hitStun.isActive(now)) {
      this.updateTint(now);
      return; // odrzut po trafieniu — prędkość nadana w takeHit
    }

    const decision = this.brain.think({
      self: { x: this.x, y: this.y },
      target: perception.target,
      canSeeTarget: perception.canSeeTarget,
      attackPhase: this.attackCycle.phase(now),
    });

    if (decision.startAttack) this.attackCycle.tryStart(now);
    if (this.attackCycle.consumeRelease(now)) this.releaseAttack(perception.target, handler);

    const speed = this.definition.moveSpeed * this.status.speedMultiplier(now);
    this.setVelocity(decision.move.x * speed, decision.move.y * speed);
    this.updateTint(now);
  }

  takeHit(hit: Hit, now: number, source: Vector2): DamageResult {
    const result = this.health.takeDamage(hit.damage);
    this.hitStun.start(now, HIT_STUN_MS);
    this.hitFlash.start(now, HIT_FLASH_MS);
    this.setVelocity(hit.knockback.x, hit.knockback.y);
    this.brain.alert(source);
    if (!result.died) this.status.apply(hit.status, now);
    return result;
  }

  private releaseAttack(target: Vector2, handler: EnemyAttackHandler): void {
    const attack = this.definition.attack;
    switch (attack.kind) {
      case EnemyAttackKind.Melee:
        handler.meleeStrike(this, attack);
        break;
      case EnemyAttackKind.Projectile:
        handler.fireProjectile(this, attack, target);
        break;
    }
  }

  private updateTint(now: number): void {
    const tint = statusTint(this.status, now);
    if (this.hitFlash.isActive(now)) {
      this.setTintFill(0xffffff);
    } else if (tint !== null) {
      this.setTint(tint);
    } else if (this.attackCycle.phase(now) === AttackPhase.Windup) {
      this.setTint(WINDUP_TINT);
    } else {
      this.clearTint();
    }
  }
}
