import Phaser from 'phaser';
import type { BossAttackPlan, BossDefinition } from '@/core/bossTypes';
import { BossPhase } from '@/core/bossTypes';
import type { DamageResult, Hit } from '@/core/combatTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';
import { TextureKey } from '@/core/types';
import { BossBrain } from '@/ai/BossBrain';
import { Health } from '@/systems/Health';
import type { MeleeTarget } from '@/systems/MeleeResolver';
import { Timer } from '@/systems/Timer';

const HIT_FLASH_MS = 70;
const ENRAGE_TINT = 0xff7050;

/** Widok + ciało bossa. Decyzje podejmuje BossBrain; wykonanie ataków — BossFight. */
export class Boss extends Phaser.Physics.Arcade.Sprite implements MeleeTarget {
  readonly definition: BossDefinition;
  readonly health: Health;

  private readonly brain: BossBrain;
  private readonly hitFlash = new Timer();
  private enraged = false;

  constructor(scene: Phaser.Scene, x: number, y: number, definition: BossDefinition, rng: Rng) {
    super(scene, x, y, TextureKey.Boss);
    this.definition = definition;
    this.health = new Health(definition.maxHp);
    this.brain = new BossBrain(definition, rng);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCircle(definition.radius);
    // Ciężki przeciwnik: nie da się go przepchnąć ani odrzucić.
    this.setImmovable(true);
    this.setPushable(false);
    this.setDepth(9);
  }

  get radius(): number {
    return this.definition.radius;
  }

  get isDead(): boolean {
    return this.health.isDead;
  }

  get isFighting(): boolean {
    return this.brain.currentPhase === BossPhase.Fighting;
  }

  get isEnraged(): boolean {
    return this.enraged;
  }

  activate(now: number): void {
    this.brain.activate(now);
  }

  /** Zwraca nowy plan ataku, jeśli boss właśnie go rozpoczyna. */
  tick(target: Vector2, now: number): BossAttackPlan | null {
    if (this.isDead) {
      this.setVelocity(0, 0);
      return null;
    }
    const decision = this.brain.think({
      self: { x: this.x, y: this.y },
      target,
      now,
      hpRatio: this.health.value / this.health.max,
    });
    this.enraged = decision.enraged;
    this.setVelocity(decision.move.x * this.definition.moveSpeed, decision.move.y * this.definition.moveSpeed);
    this.updateTint(now);
    return decision.newAttack;
  }

  takeHit(hit: Hit, now: number, _source: Vector2): DamageResult {
    // Trafienie budzi bossa, nawet jeśli gracz zaatakował go z progu areny.
    this.activate(now);
    this.hitFlash.start(now, HIT_FLASH_MS);
    return this.health.takeDamage(hit.damage);
  }

  private updateTint(now: number): void {
    if (this.hitFlash.isActive(now)) this.setTintFill(0xffffff);
    else if (this.enraged) this.setTint(ENRAGE_TINT);
    else this.clearTint();
  }
}
