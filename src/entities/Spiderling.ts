import Phaser from 'phaser';
import type { SpiderlingDefinition } from '@/core/bossTypes';
import type { DamageResult, Hit } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import type { SpiderlingDecision } from '@/ai/SpiderlingBrain';
import { SpiderlingBrain } from '@/ai/SpiderlingBrain';
import { SPRITE_SHEETS, spiderlingVisual } from '@/config/spriteConfig';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { DirectionalAnimator } from '@/entities/DirectionalAnimator';
import { attachGroundShadow } from '@/effects/GroundShadow';
import { Health } from '@/systems/Health';
import type { MeleeTarget } from '@/systems/MeleeResolver';

/**
 * Pajączek-kamikaze z wylęgu Matki Pająków. Decyzje podejmuje SpiderlingBrain; wybuch i obrażenia
 * rozstrzyga BossFight. Każde trafienie gracza zabija go bez wybuchu.
 */
export class Spiderling extends Phaser.Physics.Arcade.Sprite implements MeleeTarget {
  readonly definition: SpiderlingDefinition;
  private readonly health: Health;
  private readonly brain: SpiderlingBrain;
  private readonly animator: DirectionalAnimator;
  /** Pajączek albo żuk z roju Brudnej Wiedźmy (krok 137). */
  private readonly visual: ReturnType<typeof spiderlingVisual>;

  constructor(scene: Phaser.Scene, x: number, y: number, definition: SpiderlingDefinition, now: number) {
    const visual = spiderlingVisual(definition.look);
    super(scene, x, y, SPRITE_SHEETS[visual.sheet].key);
    this.visual = visual;
    this.definition = definition;
    this.health = new Health(definition.maxHp);
    this.brain = new SpiderlingBrain(definition, now);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCircle(definition.radius, this.width / 2 - definition.radius, this.height / 2 - definition.radius);
    this.setDepth(RENDER_DEPTH.enemy);
    this.animator = new DirectionalAnimator(this, visual.sheet);
    attachGroundShadow(this, visual.groundShadow);
    this.animator.play(visual.move);
  }

  get radius(): number {
    return this.definition.radius;
  }

  get isDead(): boolean {
    return this.health.isDead;
  }

  /** Chwila wybuchu (Infinity przed zapłonem) — do rysowania telegrafu. */
  get explosionAt(): number {
    return this.brain.explosionAt;
  }

  tick(target: Vector2, now: number): SpiderlingDecision {
    const decision = this.brain.think({ x: this.x, y: this.y }, target, now);
    const speed = this.definition.moveSpeed;
    this.setVelocity(decision.move.x * speed, decision.move.y * speed);
    if (decision.primeStarted) {
      this.animator.face({ x: target.x - this.x, y: target.y - this.y });
      this.animator.restart(this.visual.prime, this.definition.primeMs);
    } else if (decision.move.x !== 0 || decision.move.y !== 0) {
      this.animator.face(decision.move);
      this.animator.play(this.visual.move);
    }
    return decision;
  }

  takeHit(hit: Hit, _now: number, _source: Vector2): DamageResult {
    return this.health.takeDamage(hit.damage);
  }
}
