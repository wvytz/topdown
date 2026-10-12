import Phaser from 'phaser';
import type { Hit, PlayerCombatConfig } from '@/core/combatTypes';
import type { MovementIntent, PlayerStats, Vector2 } from '@/core/types';
import { TextureKey } from '@/core/types';
import { PLAYER_SIZE } from '@/config/gameConfig';
import type { PlayerLoadout } from '@/systems/PlayerLoadout';
import { AttackCycle } from '@/systems/AttackCycle';
import { angleTo } from '@/systems/CombatMath';
import { DashController } from '@/systems/DashController';
import { Health } from '@/systems/Health';
import { computeVelocity } from '@/systems/MovementSystem';
import { Timer } from '@/systems/Timer';

/** Abstrakcyjne akcje gracza w danej klatce — produkuje je InputController. */
export interface PlayerActions {
  readonly move: MovementIntent;
  /** Punkt celowania w świecie (px). */
  readonly aim: Vector2;
  readonly attack: boolean;
  readonly dash: boolean;
  /** Interakcja z otoczeniem (np. kapliczka) — obsługuje scena, nie gracz. */
  readonly interact: boolean;
}

const KNOCKBACK_STUN_MS = 120;
const AIM_MARKER_DISTANCE = 22;

/** Widok + ciało fizyczne gracza. Zasady (HP, cooldowny, dash) delegowane do czystych systemów. */
export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly health: Health;
  readonly radius = PLAYER_SIZE / 2;

  private stats: PlayerStats;
  private combat: PlayerCombatConfig;
  private attackCycle: AttackCycle;
  private dash: DashController;
  private readonly invulnerability = new Timer();
  private readonly knockbackStun = new Timer();
  private readonly aimMarker: Phaser.GameObjects.Image;
  private aimAngle = 0;

  /**
   * @param loadout statystyki po zastosowaniu przedmiotów (PlayerLoadout)
   * @param startHp HP przeniesione z poprzedniego piętra; null = pełne
   */
  constructor(scene: Phaser.Scene, x: number, y: number, loadout: PlayerLoadout, startHp: number | null) {
    super(scene, x, y, TextureKey.Player);
    this.stats = loadout.stats;
    this.combat = loadout.combat;
    this.health = new Health(loadout.stats.maxHp, startHp ?? loadout.stats.maxHp);
    this.attackCycle = new AttackCycle(0, loadout.combat.attackCooldownMs);
    this.dash = new DashController(loadout.combat.dash);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setDepth(10);

    this.aimMarker = scene.add.image(x, y, TextureKey.AimMarker).setDepth(11);
  }

  get isDead(): boolean {
    return this.health.isDead;
  }

  /** Aktualna konfiguracja walki (zmienia się wraz z przedmiotami). */
  get combatConfig(): PlayerCombatConfig {
    return this.combat;
  }

  /** Podmiana statystyk po zdobyciu przedmiotu. Wzrost maks. HP leczy o tę samą wartość. */
  applyLoadout(loadout: PlayerLoadout): void {
    this.stats = loadout.stats;
    this.combat = loadout.combat;
    this.attackCycle = new AttackCycle(0, loadout.combat.attackCooldownMs);
    this.dash = new DashController(loadout.combat.dash);
    this.health.setMax(loadout.stats.maxHp);
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

  /** Zwraca true, jeśli w tej klatce nastąpiło uderzenie bronią (do rozstrzygnięcia przez scenę). */
  tick(actions: PlayerActions, now: number): boolean {
    this.aimAngle = angleTo(this, actions.aim);
    this.updateAimMarker();

    if (this.isDead) {
      this.setVelocity(0, 0);
      return false;
    }

    if (actions.dash) {
      const moving = actions.move.x !== 0 || actions.move.y !== 0;
      const direction = moving ? actions.move : { x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) };
      this.dash.tryStart(now, direction);
    }

    if (this.dash.isDashing(now)) {
      const velocity = this.dash.velocity();
      this.setVelocity(velocity.x, velocity.y);
    } else if (!this.knockbackStun.isActive(now)) {
      const velocity = computeVelocity(actions.move, this.stats);
      this.setVelocity(velocity.x, velocity.y);
    }

    if (actions.attack) this.attackCycle.tryStart(now);
    const struck = this.attackCycle.consumeRelease(now);

    this.updateVisuals(now);
    return struck;
  }

  /** Zwraca true, jeśli trafienie zostało przyjęte (gracz nie był nietykalny). */
  takeHit(hit: Hit, now: number): boolean {
    if (this.isDead || this.isInvulnerable(now)) return false;

    this.health.takeDamage(hit.damage);
    this.invulnerability.start(now, this.combat.invulnerabilityMs);
    this.knockbackStun.start(now, KNOCKBACK_STUN_MS);
    this.setVelocity(hit.knockback.x, hit.knockback.y);

    if (this.isDead) {
      this.setVelocity(0, 0);
      this.setTint(0x555555).setAlpha(1);      this.aimMarker.setVisible(false);
    }
    return true;
  }

  private updateAimMarker(): void {
    this.aimMarker.setPosition(
      this.x + Math.cos(this.aimAngle) * AIM_MARKER_DISTANCE,
      this.y + Math.sin(this.aimAngle) * AIM_MARKER_DISTANCE,
    );
    this.aimMarker.setRotation(this.aimAngle);
  }

  private updateVisuals(now: number): void {
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
