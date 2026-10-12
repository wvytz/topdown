/** Typy domenowe walki — czyste dane, bez zależności od Phasera. */
import type { Vector2 } from '@/core/types';

export enum EnemyType {
  Rusher = 'rusher',
  Kiter = 'kiter',
}

/** Stany maszyny stanów AI (wg GDD: IDLE, CHASE, ATTACK). */
export enum EnemyState {
  Idle = 'idle',
  Chase = 'chase',
  Attack = 'attack',
}

/** Faza cyklu ataku: zamach (telegraf) → odnowienie → gotowość. */
export enum AttackPhase {
  Ready = 'ready',
  Windup = 'windup',
  Recovery = 'recovery',
}

export enum EnemyAttackKind {
  Melee = 'melee',
  Projectile = 'projectile',
}

/** Pojedyncze trafienie: ile obrażeń i jaki odrzut (px/s) otrzymuje cel. */
export interface Hit {
  readonly damage: number;
  readonly knockback: Vector2;
}

export interface DamageResult {
  readonly dealt: number;
  readonly died: boolean;
}

interface BaseAttackDefinition {
  readonly damage: number;
  /** Dystans (środek–środek, px), z którego AI rozpoczyna atak. */
  readonly range: number;
  /** Czas zamachu — telegraf, w którym gracz może zareagować. */
  readonly windupMs: number;
  /** Czas od rozpoczęcia ataku do gotowości następnego. */
  readonly cooldownMs: number;
  readonly knockback: number;
}

export interface MeleeAttackDefinition extends BaseAttackDefinition {
  readonly kind: EnemyAttackKind.Melee;
  /** Faktyczny zasięg trafienia w chwili uderzenia (po zamachu). */
  readonly hitRange: number;
}

export interface ProjectileAttackDefinition extends BaseAttackDefinition {
  readonly kind: EnemyAttackKind.Projectile;
  readonly projectileSpeed: number;
  readonly projectileLifetimeMs: number;
}

export type EnemyAttackDefinition = MeleeAttackDefinition | ProjectileAttackDefinition;

/** Utrzymywanie dystansu przez przeciwników dystansowych. */
export interface KitingBehaviour {
  /** Powyżej tego dystansu podchodzi bliżej. */
  readonly preferredRange: number;
  /** Poniżej tego dystansu ucieka od gracza. */
  readonly retreatRange: number;
}

export interface EnemyBehaviour {
  /** Zasięg wykrycia gracza (wymaga linii wzroku). */
  readonly aggroRange: number;
  readonly kiting?: KitingBehaviour;
}

export interface EnemyDefinition {
  readonly type: EnemyType;
  readonly radius: number;
  readonly color: number;
  readonly maxHp: number;
  readonly moveSpeed: number;
  readonly attack: EnemyAttackDefinition;
  readonly behaviour: EnemyBehaviour;
}

export interface DashConfig {
  readonly speed: number;
  readonly durationMs: number;
  readonly cooldownMs: number;
}

/** Atak dystansowy gracza (PPM): strzał z puli ładunków odnawiających się z czasem. */
export interface RangedConfig {
  readonly damage: number;
  readonly knockback: number;
  readonly projectileSpeed: number;
  readonly projectileLifetimeMs: number;
  readonly projectileRadius: number;
  readonly maxCharges: number;
  /** Czas odnowienia jednego ładunku. */
  readonly rechargeMs: number;
  /** Minimalny odstęp między strzałami (żeby seria nie wyszła w jednej klatce). */
  readonly shotIntervalMs: number;
}

export interface PlayerCombatConfig {
  readonly meleeDamage: number;
  readonly meleeRange: number;
  readonly meleeArcDeg: number;
  readonly attackCooldownMs: number;
  readonly knockback: number;
  /** Nietykalność po otrzymaniu trafienia. */
  readonly invulnerabilityMs: number;
  readonly dash: DashConfig;
  readonly ranged: RangedConfig;
}

export interface EnemyScalingConfig {
  /** Przyrost HP na każde piętro powyżej pierwszego (0.15 = +15%). */
  readonly hpPerFloor: number;
  readonly damagePerFloor: number;
}
