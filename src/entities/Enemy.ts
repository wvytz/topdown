import { SoundCue, sound } from '@/audio/SoundBoard';
import Phaser from 'phaser';
import type {
  BroodAttackDefinition,
  DamageResult,
  EnemyDefinition,
  Hit,
  LobAttackDefinition,
  MeleeAttackDefinition,
  PounceAttackDefinition,
  ProjectileAttackDefinition,
} from '@/core/combatTypes';
import { AttackPhase, EliteAffix, EnemyAttackKind } from '@/core/combatTypes';
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
import { ELITE_CONFIG } from '@/config/eliteConfig';
import { GHOST_VISUAL } from '@/config/spriteConfig';
import { isPhased } from '@/systems/Ambush';
import { isShielded, turnToward } from '@/systems/Shield';
import type { ShieldChargeConfig } from '@/systems/ShieldCharge';
import { ChargeOutcome, ChargePhase, ShieldCharge } from '@/systems/ShieldCharge';

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
  /** Szarża Tarczownika (krok 99): czy w tej klatce trafiła gracza (raz na szarżę). */
  chargeHit(enemy: Enemy, charge: ShieldChargeConfig): boolean;
  /** Tarczownik wbił się w ścianę — efekt uderzenia. */
  chargeWall(enemy: Enemy): void;
  /** Gniazdownik (krok 122): ile stworków może teraz wypluć (0 = nie zaczyna zamachu). */
  broodCapacity(enemy: Enemy, attack: BroodAttackDefinition): number;
  /** Wylęg po zamachu: stworki wachlarzem w stronę celu. */
  brood(enemy: Enemy, attack: BroodAttackDefinition, target: Vector2): void;
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
const BLOCKED_FLASH_TINT = 0x8a90a0;
/** Tarczownik ogłuszony po wbiciu w ścianę (krok 99) — chłodny, „przygaszony” odcień. */
const CHARGE_STUN_TINT = 0x8fa8ff;

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
  /** Tarczownik (elita, krok 42): kąt tarczy, obracanej powoli w stronę gracza. */
  private shieldFacing = Math.PI / 2;
  /** Szarża Tarczownika (krok 99) zamiast skoku; null bez tarczy. */
  private readonly charge: ShieldCharge | null;
  /** Tarczownik po ciosie tarczą (krok 113): opuszczona tarcza — okno na pełne combo. */
  private readonly guardDown = new Timer();
  private lastTickAt: number | null = null;
  /** Ostatnie trafienie przyjęte na tarczę — błysk w kolorze stali zamiast bieli. */
  private lastHitBlocked = false;

  /** Upiór (krok 49): przesunięcie fazy przenikania i koniec wynurzania (do tej chwili nietykalny i bierny). */
  private readonly phaseOffsetMs: number;
  private readonly riseUntil: number;
  private readonly riseStart: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    definition: EnemyDefinition,
    options: { readonly phaseOffsetMs?: number; readonly riseMs?: number } = {},
  ) {
    super(scene, x, y, SPRITE_SHEETS[ENEMY_VISUALS[definition.variant].sheet].key);
    this.definition = definition;
    this.health = new Health(definition.maxHp);
    this.brain = new EnemyBrain(definition.behaviour, definition.attack.range, ENEMY_VIEW_RULE);
    this.attackCycle = new AttackCycle(definition.attack.windupMs, definition.attack.cooldownMs);
    this.charge = definition.affixes?.includes(EliteAffix.Shielded) ? new ShieldCharge(ELITE_CONFIG.shield.charge) : null;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Klatka 48×48 z postacią pośrodku — okrągłe ciało o promieniu z definicji, wyśrodkowane.
    this.setCircle(definition.radius, this.width / 2 - definition.radius, this.height / 2 - definition.radius);
    this.setDepth(RENDER_DEPTH.enemy);
    this.visual = ENEMY_VISUALS[definition.variant];
    this.animator = new DirectionalAnimator(this, this.visual.sheet);
    if (this.visual.groundShadow) attachGroundShadow(this, this.visual.groundShadow);
    this.animator.play(this.visual.idle ?? this.visual.move);
    this.phaseOffsetMs = options.phaseOffsetMs ?? 0;
    this.riseStart = scene.time.now;
    this.riseUntil = scene.time.now + (options.riseMs ?? 0);
    // Upiór świeci nad mrokiem (zasadzka przyciemnia światło).
    if (this.visual.aboveDarkness) this.setDepth(RENDER_DEPTH.darkness + 0.1);
  }

  /** Bezcielesny (przenikanie) albo jeszcze się wynurza — wtedy nietykalny i nie atakuje. */
  isIntangible(now: number): boolean {
    if (now < this.riseUntil) return true;
    const phasing = this.definition.phasing;
    return phasing ? isPhased(phasing, this.phaseOffsetMs, now) : false;
  }

  /** Przezroczystość upiora: wynurzanie, potem cielesny/bezcielesny. */
  private updateGhostAlpha(now: number): void {
    if (!this.definition.phasing) return;
    if (now < this.riseUntil) {
      const t = (now - this.riseStart) / Math.max(1, this.riseUntil - this.riseStart);
      this.setAlpha(GHOST_VISUAL.riseFromAlpha + (GHOST_VISUAL.solidAlpha - GHOST_VISUAL.riseFromAlpha) * t);
      return;
    }
    this.setAlpha(this.isIntangible(now) ? GHOST_VISUAL.phasedAlpha : GHOST_VISUAL.solidAlpha);
  }

  get radius(): number {
    return this.definition.radius;
  }

  get isDead(): boolean {
    return this.health.isDead;
  }

  hasAffix(affix: EliteAffix): boolean {
    return this.definition.affixes?.includes(affix) ?? false;
  }

  /** Kąt tarczy Tarczownika (radiany) albo null bez tarczy. */
  get shieldAngle(): number | null {
    return this.hasAffix(EliteAffix.Shielded) && !this.isShieldLowered(this.scene.time.now) ? this.shieldFacing : null;
  }

  /** Obrażenia od podpalenia należne do `now`; śmierć od ognia wykrywa menedżer po `isDead`. */
  tickBurn(now: number): number {
    const damage = this.status.takeBurnDamage(now);
    if (damage > 0 && !this.isDead) {
      this.health.takeDamage(damage);
      this.hitFlash.start(now, HIT_FLASH_MS);
      this.lastHitBlocked = false;
    }
    return damage;
  }

  /** Tor szarży Tarczownika w trakcie zamachu (telegraf); null poza nim. */
  get chargeTelegraph(): { readonly from: Vector2; readonly to: Vector2 } | null {
    if (!this.charge || this.charge.phase(this.scene.time.now) !== ChargePhase.Windup) return null;
    return this.charge.lane({ x: this.x, y: this.y });
  }

  /** Cel skoku w trakcie zamachu (do rysowania telegrafu); null poza zamachem skoku. */
  get pounceTelegraph(): Vector2 | null {
    return this.attackCycle.phase(this.scene.time.now) === AttackPhase.Windup ? this.pounceAim : null;
  }

  tick(perception: EnemyPerception, now: number, handler: EnemyAttackHandler): void {
    if (this.isDead) return;
    this.turnShield(perception, now);
    this.updateGhostAlpha(now);
    if (now < this.riseUntil) {
      this.setVelocity(0, 0);
      return;
    }
    // Bezcielesny upiór dalej płynie do gracza, ale nie atakuje (przerwany zamach przepada).
    if (this.isIntangible(now)) {
      this.attackCycle.interrupt();
      const speed = this.definition.moveSpeed * this.status.speedMultiplier(now);
      const dx = perception.target.x - this.x;
      const dy = perception.target.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.setVelocity((dx / d) * speed, (dy / d) * speed);
      this.animator.face({ x: dx, y: dy });
      this.animator.play(this.visual.move);
      this.updateTint(now);
      return;
    }
    if (this.pounce) {
      this.updatePounce(now, handler);
      return;
    }
    if (this.charge && this.updateCharge(this.charge, perception, now, handler)) return;
    if (this.guardDown.isActive(now)) {
      // Opuszczona tarcza: stoi (odrzut z trafienia działa) i nie zaczyna ataku.
      if (!this.hitStun.isActive(now)) this.setVelocity(0, 0);
      this.animator.play(this.visual.idle ?? this.visual.move);
      this.updateTint(now);
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

    if (decision.startAttack && this.canStartAttack(handler) && this.attackCycle.tryStart(now)) {
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
    // Bezcielesny upiór: ciosy i strzały przenikają przez niego; magia Czarodziejki trafia zawsze (krok 49b).
    if (this.isIntangible(now) && !hit.magic) return { dealt: 0, died: false };
    // Tarczownik: cios od frontu przyjmuje tylko część obrażeń (wybuch z góry — całość).
    const shield = ELITE_CONFIG.shield;
    const blocked =
      this.hasAffix(EliteAffix.Shielded) &&
      !hit.unblockable &&
      !this.isShieldLowered(now) &&
      isShielded(this, this.shieldFacing, shield.arcDeg, source);
    const damage = blocked ? Math.max(1, Math.round(hit.damage * shield.frontMultiplier)) : hit.damage;
    const result = this.health.takeDamage(damage);
    this.hitFlash.start(now, HIT_FLASH_MS);
    this.lastHitBlocked = blocked;
    if (!result.died) sound.play(blocked ? SoundCue.ShieldBlock : SoundCue.EnemyHit, this);
    // Skoku i szarży nie da się zatrzymać trafieniem — bez odrzutu i ogłuszenia w biegu.
    if (!this.pounce && this.charge?.phase(now) !== ChargePhase.Charging) {
      this.hitStun.start(now, HIT_STUN_MS);
      this.setVelocity(hit.knockback.x, hit.knockback.y);
    }
    this.brain.alert(source);
    if (!result.died) this.status.apply(hit.status, now);
    return result;
  }

  /** Tarcza obraca się do widocznego gracza z ograniczoną prędkością (nie w locie skoku). */
  private turnShield(perception: EnemyPerception, now: number): void {
    const dt = this.lastTickAt === null ? 0 : now - this.lastTickAt;
    this.lastTickAt = now;
    if (!this.hasAffix(EliteAffix.Shielded) || this.pounce || !perception.canSeeTarget) return;
    // W trakcie szarży (zamach, bieg, ogłuszenie, postój) i z opuszczoną tarczą stoi — okno na obejście i combo.
    if (this.charge?.isBusy(now) || this.guardDown.isActive(now)) return;
    const target = Math.atan2(perception.target.y - this.y, perception.target.x - this.x);
    const step = ((ELITE_CONFIG.shield.turnRateDegPerSec * Math.PI) / 180) * (dt / 1000);
    this.shieldFacing = turnToward(this.shieldFacing, target, step);
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

  /** Gniazdo bez miejsca na stworki (limit żywych albo wyczerpany zapas) nie zaczyna zamachu. */
  private canStartAttack(handler: EnemyAttackHandler): boolean {
    const attack = this.definition.attack;
    return attack.kind !== EnemyAttackKind.Brood || handler.broodCapacity(this, attack) > 0;
  }

  private releaseAttack(target: Vector2, handler: EnemyAttackHandler, now: number): void {
    const attack = this.definition.attack;
    switch (attack.kind) {
      case EnemyAttackKind.Melee:
        handler.meleeStrike(this, attack);
        if (this.hasAffix(EliteAffix.Shielded)) this.guardDown.start(now, ELITE_CONFIG.shield.guardDownMs);
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
      case EnemyAttackKind.Brood:
        handler.brood(this, attack, target);
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

  /**
   * Szarża Tarczownika (krok 99): rusza tylko w gotowości (nie w zamachu ciosu ani ogłuszony), gdy gracz jest
   * przed tarczą w zasięgu szarży. Zwraca true, gdy szarża zajmuje wroga w tej klatce.
   */
  private updateCharge(charge: ShieldCharge, perception: EnemyPerception, now: number, handler: EnemyAttackHandler): boolean {
    if (charge.phase(now) === ChargePhase.Ready) {
      const busy =
        this.status.isStunned(now) ||
        this.hitStun.isActive(now) ||
        this.guardDown.isActive(now) ||
        this.attackCycle.phase(now) === AttackPhase.Windup;
      if (busy || !charge.canStart(now, this, perception.target, perception.canSeeTarget, this.shieldFacing)) return false;
      charge.start(now, this, perception.target);
      this.shieldFacing = Math.atan2(charge.direction.y, charge.direction.x);
    }
    const config = ELITE_CONFIG.shield.charge;
    const dir = charge.direction;
    switch (charge.phase(now)) {
      case ChargePhase.Windup:
        this.setVelocity(0, 0);
        this.animator.face(dir);
        this.animator.play(this.visual.attack ?? this.visual.idle ?? this.visual.move, config.windupMs);
        break;
      case ChargePhase.Charging: {
        const blocked = this.body instanceof Phaser.Physics.Arcade.Body && !this.body.blocked.none;
        const outcome = charge.advance(now, this, blocked);
        if (outcome === ChargeOutcome.Continue && handler.chargeHit(this, config)) charge.registerHit(now);
        if (charge.phase(now) === ChargePhase.Charging) {
          this.setVelocity(dir.x * config.speed, dir.y * config.speed);
          this.animator.face(dir);
          this.animator.play(this.visual.move);
        } else {
          this.setVelocity(0, 0);
          if (outcome === ChargeOutcome.Wall) handler.chargeWall(this);
        }
        break;
      }
      default:
        this.setVelocity(0, 0);
        this.animator.play(this.visual.idle ?? this.visual.move);
    }
    this.updateTint(now);
    return true;
  }

  /** Tarczownik bez tarczy: po ciosie tarczą (krok 113) i ogłuszony po wbiciu w ścianę. */
  private isShieldLowered(now: number): boolean {
    return this.guardDown.isActive(now) || this.charge?.phase(now) === ChargePhase.Stunned;
  }

  private updateTint(now: number): void {
    const tint = statusTint(this.status, now);
    const chargePhase = this.charge?.phase(now);
    if (this.hitFlash.isActive(now)) {
      this.setTintFill(this.lastHitBlocked ? BLOCKED_FLASH_TINT : 0xffffff);
    } else if (tint !== null) {
      this.setTint(tint);
    } else if (chargePhase === ChargePhase.Stunned) {
      this.setTint(CHARGE_STUN_TINT);
    } else if (this.attackCycle.phase(now) === AttackPhase.Windup || chargePhase === ChargePhase.Windup) {
      this.setTint(WINDUP_TINT);
    } else {
      this.clearTint();
    }
  }
}
