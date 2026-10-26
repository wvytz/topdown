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
import { ShieldGuard, isGuardLowered, isShielded, turnToward } from '@/systems/Shield';

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
  /** Kierunek tarczy (radiany; Strażnik Bram, krok 41e) — obraca się do gracza z ograniczoną prędkością. */
  private shieldFacing = Math.PI / 2;
  private lastTickAt: number | null = null;
  /** Wytrzymałość tarczy (krok 74); null = tarcza niezniszczalna albo brak tarczy. */
  private readonly guard: ShieldGuard | null;
  private guardNow = 0;
  private shieldBreakPending = false;
  /** Koniec ostatniego ataku — od niego liczy się okno z opuszczoną tarczą (krok 111). */
  private lastAttackEndsAt = -Infinity;

  constructor(scene: Phaser.Scene, x: number, y: number, definition: BossDefinition, rng: Rng) {
    super(scene, x, y, SPRITE_SHEETS[BOSS_VISUALS[definition.id].sheet].key);
    this.definition = definition;
    this.visual = BOSS_VISUALS[definition.id];
    this.health = new Health(definition.maxHp);
    this.brain = new BossBrain(definition, rng);
    const guard = definition.shield?.guard;
    this.guard = guard ? new ShieldGuard(guard.hp, guard.breakMs) : null;

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

  /** Kierunek patrzenia (wiersz arkusza) — animacja śmierci zachowuje go. */
  get facing(): number {
    return this.animator.facing;
  }

  /** Kierunek tarczy (radiany) albo null, gdy boss nie ma tarczy. */
  get shieldAngle(): number | null {
    return this.definition.shield && !this.isGuardLowered(this.guardNow) ? this.shieldFacing : null;
  }

  /** Czy atak z punktu `from` trafia w tarczę (przód bossa). */
  isShieldedFrom(from: Vector2): boolean {
    const shield = this.definition.shield;
    if (!shield || !this.isFighting || this.isShieldBroken || this.isGuardLowered(this.guardNow)) return false;
    return isShielded(this, this.shieldFacing, shield.arcDeg, from);
  }

  /** Tarcza pęknięta (krok 74) — boss odsłonięty ze wszystkich stron. */
  get isShieldBroken(): boolean {
    return this.guard?.isBroken(this.guardNow) ?? false;
  }

  /** Pozostała wytrzymałość tarczy (0..1); 1, gdy tarcza jej nie ma. */
  get shieldFraction(): number {
    return this.guard?.fraction(this.guardNow) ?? 1;
  }

  /** Tarcza właśnie pękła — jednorazowo, żeby gra pokazała efekt. */
  consumeShieldBreak(): boolean {
    const broke = this.shieldBreakPending;
    this.shieldBreakPending = false;
    return broke;
  }

  get isEnraged(): boolean {
    return this.enraged;
  }

  activate(now: number): void {
    this.brain.activate(now);
  }

  /** Leczenie (uczta i kąsanie Grzybowego Pożeracza). */
  heal(amount: number): void {
    this.health.heal(amount);
  }

  /** Pożeracz zjadł kokon — kolejny stos wzmocnienia. */
  feasted(): void {
    this.brain.feasted();
  }

  get feastStacks(): number {
    return this.brain.feastStacks;
  }

  /**
   * Zwraca nowy plan ataku, jeśli boss właśnie go rozpoczyna. `summonsAlive` — żywe pajączki z wylęgów;
   * `larders` — kokony spiżarni, które Pożeracz może pożreć.
   */
  tick(target: Vector2, now: number, summonsAlive = 0, larders: readonly Vector2[] = [], braziers: readonly Vector2[] = []): BossAttackPlan | null {
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
      larders,
      braziers,
    });
    this.enraged = decision.enraged;
    if (decision.newAttack) this.lastAttackEndsAt = decision.newAttack.endsAt;
    // Opuszczona tarcza po ataku (krok 111): boss stoi — okno na combo.
    const speed = this.isGuardLowered(now) ? 0 : decision.speed * this.status.speedMultiplier(now);
    this.setVelocity(decision.move.x * speed, decision.move.y * speed);
    this.updateAnimation(target, decision.newAttack, now);
    this.updateTint(now);
    return decision.newAttack;
  }

  takeHit(hit: Hit, now: number, source: Vector2): DamageResult {
    // Trafienie budzi bossa, nawet jeśli gracz zaatakował go z progu areny.
    this.activate(now);
    this.hitFlash.start(now, HIT_FLASH_MS);
    // Cios w tarczę (z przodu) zadaje tylko część obrażeń; pociski i promień obsługuje BossFight wcześniej.
    const shield = this.definition.shield;
    this.guardNow = now;
    const blocked = Boolean(shield) && this.isShieldedFrom(source);
    const damage = shield && blocked ? Math.max(1, Math.round(hit.damage * shield.frontMeleeMultiplier)) : hit.damage;
    if (blocked && this.guard?.absorb(hit.damage, now)) this.shieldBreakPending = true;
    const result = this.health.takeDamage(damage);
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
   * W walce boss zawsze patrzy na gracza (uśpiony — przodem do kamery). Przed atakami z `attacks`
   * gra ich animację (plucie, zew, smagnięcie): trwa do pierwszego wystrzału / wybuchu / wylęgu,
   * a ostatnia klatka trzyma się do końca ataku. Pusty wylęg (limit pajączków) nie ma animacji.
   */
  private updateAnimation(target: Vector2, newAttack: BossAttackPlan | null, now: number): void {
    const dt = this.lastTickAt === null ? 0 : now - this.lastTickAt;
    this.guardNow = now;
    this.lastTickAt = now;
    const toTarget = Math.atan2(target.y - this.y, target.x - this.x);
    if (this.definition.shield) {
      // Tarcza: na początku ataku boss zwraca się do gracza, w trakcie ataku stoi; poza atakiem obraca się wolno.
      if (newAttack) this.shieldFacing = toTarget;
      else if (this.isFighting && now >= this.attackPoseUntil && !this.isGuardLowered(now)) {
        const step = ((this.definition.shield.turnRateDegPerSec * Math.PI) / 180) * (dt / 1000);
        this.shieldFacing = turnToward(this.shieldFacing, toTarget, step);
      }
      if (this.isFighting) this.animator.face({ x: Math.cos(this.shieldFacing), y: Math.sin(this.shieldFacing) });
    } else if (this.isFighting) {
      this.animator.face({ x: target.x - this.x, y: target.y - this.y });
    }

    const animation = newAttack ? this.visual.attacks[newAttack.kind] : undefined;
    const hasEvents =
      newAttack !== null &&
      (newAttack.strikes.length + newAttack.bursts.length + newAttack.spawns.length > 0 || Boolean(newAttack.feast ?? newAttack.release));
    if (newAttack && animation && hasEvents) {
      this.attackPoseUntil = newAttack.endsAt;
      this.animator.restart(animation, attackLeadTimeMs(newAttack, now));
      return;
    }
    if (now < this.attackPoseUntil) return;
    this.animator.play(this.visual.move);
  }

  /** Tarcza opuszczona po ataku (krok 111); bossowie bez tarczy — nigdy. */
  private isGuardLowered(now: number): boolean {
    const shield = this.definition.shield;
    return shield ? isGuardLowered(this.lastAttackEndsAt, shield.loweredAfterAttackMs, now) : false;
  }

  private updateTint(now: number): void {
    const tint = statusTint(this.status, now);
    if (this.hitFlash.isActive(now)) this.setTintFill(0xffffff);
    else if (tint !== null) this.setTint(tint);
    else if (this.enraged) this.setTint(ENRAGE_TINT);
    else this.clearTint();
  }
}
