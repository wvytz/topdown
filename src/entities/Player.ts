import Phaser from 'phaser';
import type { Hit, PlayerCombatConfig, StatusApplication, WeaponEffects } from '@/core/combatTypes';
import { AttackPhase } from '@/core/combatTypes';
import type { MovementIntent, PlayerStats, RangedHudData, Vector2 } from '@/core/types';
import { PLAYER_SIZE } from '@/config/gameConfig';
import { PLAYER_STATUS_RESISTANCE } from '@/config/combatConfig';
import type { PlayerLoadout } from '@/systems/PlayerLoadout';
import { AttackCycle } from '@/systems/AttackCycle';
import { angleTo } from '@/systems/CombatMath';
import { ChargePool } from '@/systems/ChargePool';
import { LOOT_ATLAS, LOOT_FRAMES, PLAYER_VISUAL, SPRITE_SHEETS } from '@/config/spriteConfig';
import { facingDirection } from '@/systems/Facing';
import { playerAnimationState } from '@/systems/PlayerAnimation';
import { DirectionalAnimator } from '@/entities/DirectionalAnimator';
import { DashController } from '@/systems/DashController';
import { Health } from '@/systems/Health';
import { computeVelocity } from '@/systems/MovementSystem';
import { StatusEffects } from '@/systems/StatusEffects';
import { Timer } from '@/systems/Timer';
import { statusTint } from '@/effects/statusTints';
import { RENDER_DEPTH } from '@/config/renderLayers';
import { attachGroundShadow } from '@/effects/GroundShadow';

/** Abstrakcyjne akcje gracza w danej klatce — produkuje je InputController. */
export interface PlayerActions {
  readonly move: MovementIntent;
  /** Punkt celowania w świecie (px). */
  readonly aim: Vector2;
  readonly attack: boolean;
  readonly dash: boolean;
  /** Strzał (PPM, przytrzymanie = seria w tempie shotIntervalMs, dopóki są ładunki). */
  readonly shoot: boolean;
  /** Interakcja z otoczeniem (np. kapliczka) — obsługuje scena, nie gracz. */
  readonly interact: boolean;
}

/** Co gracz zrobił w tej klatce — do rozstrzygnięcia przez scenę. */
export interface PlayerTickResult {
  /** Uderzenie bronią wręcz. */
  readonly struck: boolean;
  /** Kierunek wystrzelonego pocisku; null, gdy gracz nie strzelił. */
  readonly shot: Vector2 | null;
  /** Obrażenia od trucizny w tej klatce (0 = brak) — scena pokazuje liczbę nad graczem. */
  readonly poisonDamage: number;
}

const IDLE: PlayerTickResult = { struck: false, shot: null, poisonDamage: 0 };
const KNOCKBACK_STUN_MS = 120;
const AIM_MARKER_DISTANCE = 22;

/** Widok + ciało fizyczne gracza. Zasady (HP, cooldowny, dash) delegowane do czystych systemów. */
export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly health: Health;
  readonly radius = PLAYER_SIZE / 2;

  private stats: PlayerStats;
  private combat: PlayerCombatConfig;
  private weaponEffects: WeaponEffects;
  /** Numer bieżącego dasha — Burzowy pęd rani każdego wroga raz na dash. */
  private dashCount = 0;
  private attackCycle: AttackCycle;
  private dash: DashController;
  private shotCharges: ChargePool;
  private shotCycle: AttackCycle;
  private readonly invulnerability = new Timer();
  private readonly knockbackStun = new Timer();
  /** Statusy na graczu: spowolnienie (kokony, pajęczyny, krok 23d), trucizna (Matka Pająków, krok 27); dash nie spowalnia. */
  private readonly status = new StatusEffects(PLAYER_STATUS_RESISTANCE);
  private readonly aimMarker: Phaser.GameObjects.Image;
  private aimAngle = 0;
  private readonly animator: DirectionalAnimator;

  /**
   * @param loadout statystyki po zastosowaniu przedmiotów (PlayerLoadout)
   * @param startHp HP przeniesione z poprzedniego piętra; null = pełne
   */
  constructor(scene: Phaser.Scene, x: number, y: number, loadout: PlayerLoadout, startHp: number | null) {
    super(scene, x, y, SPRITE_SHEETS[PLAYER_VISUAL.sheet].key);
    this.stats = loadout.stats;
    this.combat = loadout.combat;
    this.weaponEffects = loadout.effects;
    this.health = new Health(loadout.stats.maxHp, startHp ?? loadout.stats.maxHp);
    this.attackCycle = new AttackCycle(0, loadout.combat.attackCooldownMs);
    this.dash = new DashController(loadout.combat.dash);
    this.shotCharges = new ChargePool(loadout.combat.ranged.maxCharges, loadout.combat.ranged.rechargeMs);
    this.shotCycle = new AttackCycle(0, loadout.combat.ranged.shotIntervalMs);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Sprite 48×48 (postać ok. 32 px) — ciało fizyczne zostaje 24×24 pośrodku klatki.
    this.setBodySize(PLAYER_SIZE, PLAYER_SIZE, true);
    this.setCollideWorldBounds(true);
    this.setDepth(RENDER_DEPTH.player);
    this.animator = new DirectionalAnimator(this, PLAYER_VISUAL.sheet);
    attachGroundShadow(this, PLAYER_VISUAL.groundShadow);
    this.animator.play(PLAYER_VISUAL.idle);

    this.aimMarker = scene.add.image(x, y, LOOT_ATLAS.key, LOOT_FRAMES.aim[0]).setDepth(RENDER_DEPTH.aimMarker);
  }

  get isDead(): boolean {
    return this.health.isDead;
  }

  /** Aktualna konfiguracja walki (zmienia się wraz z przedmiotami). */
  /** Efekty broni z przedmiotów (przebicie, podpalenie, ogłuszenie…). */
  get effects(): WeaponEffects {
    return this.weaponEffects;
  }

  /** Numer bieżącego (lub ostatniego) dasha. */
  get dashId(): number {
    return this.dashCount;
  }

  isDashing(now: number): boolean {
    return this.dash.isDashing(now);
  }

  get combatConfig(): PlayerCombatConfig {
    return this.combat;
  }

  /** Podmiana statystyk po zdobyciu przedmiotu. Wzrost maks. HP leczy o tę samą wartość. */
  applyLoadout(loadout: PlayerLoadout): void {
    this.stats = loadout.stats;
    this.attackCycle = new AttackCycle(0, loadout.combat.attackCooldownMs);
    this.dash = new DashController(loadout.combat.dash);
    // Ładunki zachowujemy przy zdobyciu przedmiotu; Kołczan dokłada nowe, od razu naładowane.
    this.shotCharges.resize(loadout.combat.ranged.maxCharges, this.scene.time.now);
    this.combat = loadout.combat;
    this.weaponEffects = loadout.effects;
    this.health.setMax(loadout.stats.maxHp);
  }

  rangedStatus(now: number): RangedHudData {
    return {
      charges: this.shotCharges.available(now),
      maxCharges: this.shotCharges.maxCharges,
      rechargeProgress: this.shotCharges.rechargeProgress(now),
    };
  }

  /** Spowolnienie z otoczenia (kokon). W trakcie dasha i nietykalności nie działa — jak obrażenia. */
  applySlow(slow: NonNullable<StatusApplication['slow']>, now: number): boolean {
    if (this.isDead || this.isInvulnerable(now)) return false;
    this.status.apply({ slow }, now);
    return true;
  }

  /**
   * Spowolnienie z terenu (lepka pajęczyna): działa także w nietykalności po trafieniu,
   * bo to podłoże, nie atak — chroni przed nim tylko dash.
   */
  applyTerrainSlow(slow: NonNullable<StatusApplication['slow']>, now: number): boolean {
    if (this.isDead || this.dash.isDashing(now)) return false;
    this.status.apply({ slow }, now);
    return true;
  }

  isSlowed(now: number): boolean {
    return this.status.isSlowed(now);
  }

  heal(amount: number): void {
    this.health.heal(amount);
  }

  getAimAngle(): number {
    return this.aimAngle;
  }

  dashReadiness(now: number): number {
    return this.dash.readiness(now);
  }

  isInvulnerable(now: number): boolean {
    return this.invulnerability.isActive(now) || this.dash.isDashing(now);
  }

  /** Ruch, dash i ataki w tej klatce; trafienia rozstrzyga scena na podstawie wyniku. */
  tick(actions: PlayerActions, now: number): PlayerTickResult {
    this.aimAngle = angleTo(this, actions.aim);
    this.updateAimMarker();

    if (this.isDead) {
      this.setVelocity(0, 0);
      return IDLE;
    }

    // Trucizna tyka niezależnie od nietykalności (to status, nie nowe trafienie) i może zabić.
    const poisonDamage = this.status.takePoisonDamage(now);
    if (poisonDamage > 0) {
      this.health.takeDamage(poisonDamage);
      if (this.isDead) {
        this.die();
        return { ...IDLE, poisonDamage };
      }
    }

    if (actions.dash) {
      const moving = actions.move.x !== 0 || actions.move.y !== 0;
      const direction = moving ? actions.move : { x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) };
      if (this.dash.tryStart(now, direction)) this.dashCount++;
    }

    if (this.dash.isDashing(now)) {
      const velocity = this.dash.velocity();
      this.setVelocity(velocity.x, velocity.y);
    } else if (!this.knockbackStun.isActive(now)) {
      const velocity = computeVelocity(actions.move, this.stats);
      const slow = this.status.speedMultiplier(now);
      this.setVelocity(velocity.x * slow, velocity.y * slow);
    }

    const swingStarted = actions.attack && this.attackCycle.tryStart(now);
    const struck = this.attackCycle.consumeRelease(now);

    const shot = actions.shoot && this.tryShoot(now) ? { x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) } : null;

    this.updateVisuals(now);
    this.updateAnimation(actions, now, swingStarted);
    return { struck, shot, poisonDamage };
  }

  /** Strzał wymaga odstępu od poprzedniego i wolnego ładunku. */
  private tryShoot(now: number): boolean {
    if (this.shotCycle.phase(now) !== AttackPhase.Ready || this.shotCharges.available(now) <= 0) return false;
    this.shotCycle.tryStart(now);
    return this.shotCharges.tryConsume(now);
  }

  /** Zwraca true, jeśli trafienie zostało przyjęte (gracz nie był nietykalny). */
  takeHit(hit: Hit, now: number): boolean {
    if (this.isDead || this.isInvulnerable(now)) return false;

    this.health.takeDamage(hit.damage);
    this.invulnerability.start(now, this.combat.invulnerabilityMs);
    this.knockbackStun.start(now, KNOCKBACK_STUN_MS);
    this.setVelocity(hit.knockback.x, hit.knockback.y);
    // Status z trafienia (trucizna smagnięcia Matki Pająków).
    this.status.apply(hit.status, now);

    if (this.isDead) this.die();
    return true;
  }

  isPoisoned(now: number): boolean {
    return this.status.isPoisoned(now);
  }

  private die(): void {
    this.setVelocity(0, 0);
    this.setTint(0x555555).setAlpha(1);
    this.animator.stop();
    this.aimMarker.setVisible(false);
  }

  private updateAimMarker(): void {
    this.aimMarker.setPosition(
      this.x + Math.cos(this.aimAngle) * AIM_MARKER_DISTANCE,
      this.y + Math.sin(this.aimAngle) * AIM_MARKER_DISTANCE,
    );
    // 8 klatek kierunku (obrót co 45° w arkuszu) zamiast obrotu o dowolny kąt.
    const direction = facingDirection({ x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) });
    if (direction !== null) this.aimMarker.setFrame(LOOT_FRAMES.aim[direction]!);
  }

  /** Barbarzyńca patrzy tam, gdzie celuje; idzie, gdy się porusza; cios trwa cały cykl ataku. */
  private updateAnimation(actions: PlayerActions, now: number, swingStarted: boolean): void {
    this.animator.face({ x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) });
    const moving = actions.move.x !== 0 || actions.move.y !== 0;
    const state = playerAnimationState(this.attackCycle.phase(now), moving);
    if (state === 'attack') {
      const duration = this.combat.attackCooldownMs;
      if (swingStarted) this.animator.restart(PLAYER_VISUAL.attack, duration);
      else this.animator.play(PLAYER_VISUAL.attack, duration);
      return;
    }
    this.animator.play(state === 'move' ? PLAYER_VISUAL.move : PLAYER_VISUAL.idle);
  }

  private updateVisuals(now: number): void {
    // Trucizna migocze na zielono, spowolnienie barwi na niebiesko (statusTint).
    const tint = statusTint(this.status, now);
    if (tint !== null) this.setTint(tint);
    else this.clearTint();
    if (this.dash.isDashing(now)) {
      this.setAlpha(0.5);
    } else if (this.invulnerability.isActive(now)) {
      // Miganie w trakcie nietykalności po trafieniu.
      this.setAlpha(Math.floor(now / 80) % 2 === 0 ? 0.35 : 1);
    } else {
      this.setAlpha(1);
    }
  }
}
