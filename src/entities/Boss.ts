import Phaser from 'phaser';
import type { BossAttackPlan, BossDefinition } from '@/core/bossTypes';
import { BossPhase } from '@/core/bossTypes';
import { attackLeadTimeMs } from '@/ai/bossAttacks';
import type { BossVisual } from '@/config/spriteConfig';
import { BOSS_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';
import { DirectionalAnimator } from '@/entities/DirectionalAnimator';
import type { DamageResult, Hit } from '@/core/combatTypes';
import type { Rng } from '@/core/random';
import type { Vector2 } from '@/core/types';
import { BossBrain } from '@/ai/BossBrain';
import { Health } from '@/systems/Health';
import type { MeleeTarget } from '@/systems/MeleeResolver';
import { Timer } from '@/systems/Timer';
import { StatusEffects } from '@/systems/StatusEffects';
import { BOSS_STATUS_RESISTANCE } from '@/config/bossConfig';
import { statusTint } from '@/effects/statusTints';
import { RENDER_DEPTH } from '@/config/renderLayers';

const HIT_FLASH_MS = 70;
const ENRAGE_TINT = 0xff7050;

/** Widok + ciało bossa. Decyzje podejmuje BossBrain; wykonanie ataków — BossFight. */
export class Boss extends Phaser.Physics.Arcade.Sprite implements MeleeTarget {
  readonly definition: BossDefinition;
  readonly health: Health;

  private readonly brain: BossBrain;
  private readonly hitFlash = new Timer();
  readonly status = new StatusEffects(BOSS_STATUS_RESISTANCE);
  private enraged = false;
  private readonly animator: DirectionalAnimator;
  readonly visual: BossVisual;
  /** Do kiedy trwa animacja ataku (plucie trzyma ostatnią klatkę do końca ataku). */
  private attackPoseUntil = -Infinity;

  constructor(scene: Phaser.Scene, x: number, y: number, definition: BossDefinition, rng: Rng) {
    super(scene, x, y, SPRITE_SHEETS[BOSS_VISUALS[definition.id].sheet].key);
    this.definition = definition;
    this.visual = BOSS_VISUALS[definition.id];
    this.health = new Health(definition.maxHp);
    this.brain = new BossBrain(definition, rng);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Klatka 96×96 z bossem pośrodku — okrągłe ciało o promieniu z definicji, wyśrodkowane.
    this.setCircle(definition.radius, this.width / 2 - definition.radius, this.height / 2 - definition.radius);
    // Ciężki przeciwnik: nie da się go przepchnąć ani odrzucić.
    this.setImmovable(true);
    this.setPushable(false);
    this.setDepth(RENDER_DEPTH.boss);
    this.animator = new DirectionalAnimator(this, this.visual.sheet);
    this.animator.play(this.visual.move);
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

  /** Zwraca nowy plan ataku, jeśli boss właśnie go rozpoczyna. `summonsAlive` — żywe pajączki z wylęgów. */
  tick(target: Vector2, now: number, summonsAlive = 0): BossAttackPlan | null {
    if (this.isDead) {
      this.setVelocity(0, 0);
      return null;
    }
    if (this.status.isStunned(now)) {
      this.setVelocity(0, 0);
      this.anims.pause(); // ogłuszony boss zamiera w klatce
      this.updateTint(now);
      return null;
    }
    if (this.anims.isPaused) this.anims.resume();
    const decision = this.brain.think({
      self: { x: this.x, y: this.y },
      target,
      now,
      hpRatio: this.health.value / this.health.max,
      summonsAlive,
    });
    this.enraged = decision.enraged;
    const speed = this.definition.moveSpeed * this.status.speedMultiplier(now);
    this.setVelocity(decision.move.x * speed, decision.move.y * speed);
    this.updateAnimation(target, decision.newAttack, now);
    this.updateTint(now);
    return decision.newAttack;
  }

  takeHit(hit: Hit, now: number, _source: Vector2): DamageResult {
    // Trafienie budzi bossa, nawet jeśli gracz zaatakował go z progu areny.
    this.activate(now);
    this.hitFlash.start(now, HIT_FLASH_MS);
    const result = this.health.takeDamage(hit.damage);
    if (!result.died) {
      // Ogłuszenie odsuwa też kolejny atak — boss „traci” ten czas, a nie tylko stoi.
      const { stunnedMs } = this.status.apply(hit.status, now);
      if (stunnedMs > 0) this.brain.delay(stunnedMs);
    }
    return result;
  }

  /** Obrażenia od podpalenia należne do `now`; śmierć od ognia wykrywa BossFight po `isDead`. */
  tickBurn(now: number): number {
    const damage = this.status.takeBurnDamage(now);
    if (damage > 0 && !this.isDead) {
      this.health.takeDamage(damage);
      this.hitFlash.start(now, HIT_FLASH_MS);
    }
    return damage;
  }

  /**
   * W walce boss zawsze patrzy na gracza (uśpiony — przodem do kamery). Przed atakami z `attackKinds`
   * gra animację ataku (plucie, złożenie pajączka): trwa do pierwszego wystrzału / wybuchu / wylęgu,
   * a ostatnia klatka trzyma się do końca ataku. Pusty wylęg (limit pajączków) nie ma animacji.
   */
  private updateAnimation(target: Vector2, newAttack: BossAttackPlan | null, now: number): void {
    if (this.isFighting) this.animator.face({ x: target.x - this.x, y: target.y - this.y });

    const animated =
      newAttack !== null &&
      this.visual.attackKinds.includes(newAttack.kind) &&
      newAttack.strikes.length + newAttack.bursts.length + newAttack.spawns.length > 0;
    if (newAttack && animated) {
      this.attackPoseUntil = newAttack.endsAt;
      this.animator.restart(this.visual.attack, attackLeadTimeMs(newAttack, now));
      return;
    }
    if (now < this.attackPoseUntil) return;
    this.animator.play(this.visual.move);
  }

  private updateTint(now: number): void {
    const tint = statusTint(this.status, now);
    if (this.hitFlash.isActive(now)) this.setTintFill(0xffffff);
    else if (tint !== null) this.setTint(tint);
    else if (this.enraged) this.setTint(ENRAGE_TINT);
    else this.clearTint();
  }
}
