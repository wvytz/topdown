import Phaser from 'phaser';
import type {
  DamageResult,
  EnemyDefinition,
  Hit,
  LobAttackDefinition,
  MeleeAttackDefinition,
  PounceAttackDefinition,
  ProjectileAttackDefinition,
} from '@/core/combatTypes';
import { AttackPhase, EnemyAttackKind } from '@/core/combatTypes';
import type { Vector2 } from '@/core/types';
import { EnemyBrain } from '@/ai/EnemyBrain';
import { ENEMY_STATUS_RESISTANCE, ENEMY_VIEW_RULE } from '@/config/combatConfig';
import { AttackCycle } from '@/systems/AttackCycle';
import { Health } from '@/systems/Health';
import { StatusEffects } from '@/systems/StatusEffects';
import { Timer } from '@/systems/Timer';
import { pounceDurationMs, pounceLanding } from '@/systems/HellAttacks';
import { statusTint } from '@/effects/statusTints';
import type { EnemyVisual } from '@/config/spriteConfig';
import { ENEMY_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';
import { DirectionalAnimator } from '@/entities/DirectionalAnimator';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { attachGroundShadow } from '@/effects/GroundShadow';

/** Wykonawca ataków — encja decyduje *kiedy*, a menedżer rozstrzyga *kogo* trafia. */
export interface EnemyAttackHandler {
  meleeStrike(enemy: Enemy, attack: MeleeAttackDefinition): void;
  fireProjectile(enemy: Enemy, attack: ProjectileAttackDefinition, target: Vector2): void;
  /** Skok ogara (krok 41d): czy w tej klatce trafił gracza (raz na skok). */
  pounceHit(enemy: Enemy, attack: PounceAttackDefinition): boolean;
  /** Smuga żaru na odcinku toru skoku pokonanym od poprzedniej klatki. */
  pounceTrail(enemy: Enemy, attack: PounceAttackDefinition, from: Vector2, to: Vector2): void;
  /** Rzut łukiem kultysty (krok 41d) w miejsce gracza z chwili rzutu. */
  lobBomb(enemy: Enemy, attack: LobAttackDefinition, target: Vector2): void;
}

/** Skok w toku: tor, czas i to, czy już trafił. */
interface PounceFlight {
  readonly attack: PounceAttackDefinition;
  readonly to: Vector2;
  readonly endAt: number;
  hit: boolean;
  /** Miejsce ostatniego kawałka smugi. */
  trailFrom: Vector2;
}

export interface EnemyPerception {
  readonly target: Vector2;
  readonly canSeeTarget: boolean;
}

const HIT_STUN_MS = 150;
const HIT_FLASH_MS = 80;
const WINDUP_TINT = 0xffb347;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly definition: EnemyDefinition;
  readonly health: Health;

  private readonly brain: EnemyBrain;
  private readonly attackCycle: AttackCycle;
  private readonly hitStun = new Timer();
  private readonly hitFlash = new Timer();
  readonly status = new StatusEffects(ENEMY_STATUS_RESISTANCE);
  private readonly visual: EnemyVisual;
  private readonly animator: DirectionalAnimator;
  /** Ogar: cel skoku zapamiętany na początku zamachu (telegraf: linia do niego). */
  private pounceAim: Vector2 | null = null;
  private pounce: PounceFlight | null = null;
  /** Postój po chybionym skoku — okno na kontrę. */
  private readonly pounceRecovery = new Timer();

  constructor(scene: Phaser.Scene, x: number, y: number, definition: EnemyDefinition) {
    super(scene, x, y, SPRITE_SHEETS[ENEMY_VISUALS[definition.variant].sheet].key);
    this.definition = definition;
    this.health = new Health(definition.maxHp);
    this.brain = new EnemyBrain(definition.behaviour, definition.attack.range, ENEMY_VIEW_RULE);
    this.attackCycle = new AttackCycle(definition.attack.windupMs, definition.attack.cooldownMs);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Klatka 48×48 z postacią pośrodku — okrągłe ciało o promieniu z definicji, wyśrodkowane.
    this.setCircle(definition.radius, this.width / 2 - definition.radius, this.height / 2 - definition.radius);
    this.setDepth(RENDER_DEPTH.enemy);
    this.visual = ENEMY_VISUALS[definition.variant];
    this.animator = new DirectionalAnimator(this, this.visual.sheet);
    if (this.visual.groundShadow) attachGroundShadow(this, this.visual.groundShadow);
    this.animator.play(this.visual.idle ?? this.visual.move);
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

  /** Cel skoku w trakcie zamachu (do rysowania telegrafu); null poza zamachem skoku. */
  get pounceTelegraph(): Vector2 | null {
    return this.attackCycle.phase(this.scene.time.now) === AttackPhase.Windup ? this.pounceAim : null;
  }

  tick(perception: EnemyPerception, now: number, handler: EnemyAttackHandler): void {
    if (this.isDead) return;
    if (this.pounce) {
      this.updatePounce(now, handler);
      return;
    }
    if (this.pounceRecovery.isActive(now)) {
      this.setVelocity(0, 0);
      if (this.visual.land) this.animator.play(this.visual.land);
      this.updateTint(now);
      return;
    }

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

    if (decision.startAttack && this.attackCycle.tryStart(now)) {
      // Skok leci w miejsce gracza z początku zamachu — widać je przez cały telegraf.
      this.pounceAim = { x: perception.target.x, y: perception.target.y };
    }
    if (this.attackCycle.consumeRelease(now)) {
      this.releaseAttack(perception.target, handler, now);
      if (this.pounce) return;
    }

    const speed = this.definition.moveSpeed * this.status.speedMultiplier(now);
    this.setVelocity(decision.move.x * speed, decision.move.y * speed);
    this.updateAnimation(perception, decision.move, now);
    this.updateTint(now);
  }

  takeHit(hit: Hit, now: number, source: Vector2): DamageResult {
    const result = this.health.takeDamage(hit.damage);
    this.hitFlash.start(now, HIT_FLASH_MS);
    // Skoku nie da się zatrzymać trafieniem (rozpędzony ogar) — bez odrzutu i ogłuszenia w locie.
    if (!this.pounce) {
      this.hitStun.start(now, HIT_STUN_MS);
      this.setVelocity(hit.knockback.x, hit.knockback.y);
    }
    this.brain.alert(source);
    if (!result.died) this.status.apply(hit.status, now);
    return result;
  }

  /**
   * Zamach: patrzy na cel i (mag) rzuca — animacja trwa dokładnie tyle co zamach.
   * Poza tym patrzy w kierunku ruchu, a stojąc — na widocznego gracza.
   */
  private updateAnimation(perception: EnemyPerception, move: Vector2, now: number): void {
    const toTarget = { x: perception.target.x - this.x, y: perception.target.y - this.y };
    const moving = move.x !== 0 || move.y !== 0;

    if (this.attackCycle.phase(now) === AttackPhase.Windup) {
      this.animator.face(toTarget);
      this.animator.play(this.visual.attack ?? this.visual.idle ?? this.visual.move, this.definition.attack.windupMs);
      return;
    }
    if (moving) this.animator.face(move);
    else if (perception.canSeeTarget) this.animator.face(toTarget);
    this.animator.play(moving ? this.visual.move : (this.visual.idle ?? this.visual.move));
  }

  private releaseAttack(target: Vector2, handler: EnemyAttackHandler, now: number): void {
    const attack = this.definition.attack;
    switch (attack.kind) {
      case EnemyAttackKind.Melee:
        handler.meleeStrike(this, attack);
        break;
      case EnemyAttackKind.Projectile:
        handler.fireProjectile(this, attack, target);
        break;
      case EnemyAttackKind.Pounce: {
        const self = { x: this.x, y: this.y };
        const to = pounceLanding(self, this.pounceAim ?? target, attack.maxDistance);
        this.pounce = { attack, to, endAt: now + pounceDurationMs(self, to, attack.speed), hit: false, trailFrom: self };
        this.pounceAim = null;
        this.animator.face({ x: to.x - self.x, y: to.y - self.y });
        break;
      }
      case EnemyAttackKind.Lob:
        handler.lobBomb(this, attack, target);
        break;
    }
  }

  /** Lot w skoku: prosto do celu; trafia raz; zostawia smugę żaru; chybienie = postój. Ściana kończy skok. */
  private updatePounce(now: number, handler: EnemyAttackHandler): void {
    const pounce = this.pounce!;
    const here = { x: this.x, y: this.y };
    if (Math.hypot(here.x - pounce.trailFrom.x, here.y - pounce.trailFrom.y) >= pounce.attack.trail.spacing) {
      handler.pounceTrail(this, pounce.attack, pounce.trailFrom, here);
      pounce.trailFrom = here;
    }
    if (!pounce.hit && handler.pounceHit(this, pounce.attack)) pounce.hit = true;
    const dx = pounce.to.x - here.x;
    const dy = pounce.to.y - here.y;
    const d = Math.hypot(dx, dy);
    const blocked = this.body instanceof Phaser.Physics.Arcade.Body && !this.body.blocked.none;
    if (now >= pounce.endAt || d < 4 || blocked) {
      this.pounce = null;
      this.setVelocity(0, 0);
      if (!pounce.hit) this.pounceRecovery.start(now, pounce.attack.missRecoveryMs);
      if (this.visual.land) this.animator.play(this.visual.land);
      this.updateTint(now);
      return;
    }
    this.setVelocity((dx / d) * pounce.attack.speed, (dy / d) * pounce.attack.speed);
    if (this.visual.leap) this.animator.play(this.visual.leap);
    this.updateTint(now);
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
