import type {
  EnemyDefinition,
  EnemyScalingConfig,
  EnemyViewRule,
  PlayerCombatConfig,
  StatusResistance,
} from '@/core/combatTypes';
import { EnemyAttackKind, EnemyType } from '@/core/combatTypes';
import type { EncounterConfig } from '@/dungeon/EncounterPlanner';
import { GUARANTEED_VIEW_HALF } from '@/config/gameConfig';

export const PLAYER_COMBAT: PlayerCombatConfig = {
  meleeDamage: 12,
  meleeRange: 52,
  meleeArcDeg: 110,
  attackCooldownMs: 320,
  knockback: 260,
  invulnerabilityMs: 600,
  dash: {
    speed: 620,
    durationMs: 150,
    cooldownMs: 700,
  },
  // Strzał jest słabszy od ciosu wręcz: uzupełnienie walki (dobijanie, Kitery), nie zamiennik.
  ranged: {
    damage: 7,
    knockback: 90,
    projectileSpeed: 460,
    projectileLifetimeMs: 650,
    projectileRadius: 4,
    maxCharges: 3,
    rechargeMs: 1400,
    shotIntervalMs: 200,
  },
};

/** Na razie dwa podstawowe archetypy z GDD: wręcz (Rusher) i dystansowy (Kiter). */
export const ENEMY_DEFINITIONS: Readonly<Record<EnemyType, EnemyDefinition>> = {
  [EnemyType.Rusher]: {
    type: EnemyType.Rusher,
    radius: 11,
    color: 0xd9534f,
    maxHp: 30,
    moveSpeed: 115,
    behaviour: { aggroRange: 260 },
    attack: {
      kind: EnemyAttackKind.Melee,
      damage: 10,
      range: 32,
      hitRange: 42,
      windupMs: 350,
      cooldownMs: 1000,
      knockback: 220,
    },
  },
  [EnemyType.Kiter]: {
    type: EnemyType.Kiter,
    radius: 10,
    color: 0x9b6bd6,
    maxHp: 20,
    moveSpeed: 90,
    behaviour: {
      aggroRange: 300,
      kiting: { preferredRange: 200, retreatRange: 130 },
    },
    attack: {
      kind: EnemyAttackKind.Projectile,
      damage: 8,
      range: 280,
      windupMs: 400,
      cooldownMs: 1500,
      knockback: 120,
      projectileSpeed: 240,
      projectileLifetimeMs: 2000,
    },
  },
};

/** Wrogowie strzelają tylko z widoku gracza (krok 18): przy zoomie 2,0 widać mniej świata niż przy 1,5. */
export const ENEMY_VIEW_RULE: EnemyViewRule = {
  halfX: GUARANTEED_VIEW_HALF.x,
  halfY: GUARANTEED_VIEW_HALF.y,
  margin: 16,
  retreatSlack: 8,
};

export const ENEMY_SCALING: EnemyScalingConfig = {
  hpPerFloor: 0.15,
  damagePerFloor: 0.1,
};

export const PROJECTILE_RADIUS = 4;

/** Zwykli wrogowie: pełne efekty, krótka odporność na ponowne ogłuszenie. */
export const ENEMY_STATUS_RESISTANCE: StatusResistance = {
  stunMultiplier: 1,
  // Ogłuszenie 0,9 s + odporność 1,2 s: Elektryczną strzałą da się trzymać wroga w ogłuszeniu najwyżej ok. 43% czasu.
  stunImmunityMs: 1200,
  slowMultiplier: 1,
};

/**
 * Celowo mało przeciwników: 1–2 na pokój. Liczba rośnie tylko razem z liczbą pokojów,
 * a trudność głównie przez ENEMY_SCALING (HP/obrażenia).
 */
export function getEncounterConfigForFloor(floor: number): EncounterConfig {
  return {
    enemiesPerRoom: { min: 1, max: 2 },
    kiterChance: floor === 1 ? 0.25 : 0.35,
  };
}
