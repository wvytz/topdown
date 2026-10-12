import type {
  EnemyDefinition,
  EnemyScalingConfig,
  PlayerCombatConfig,
} from '@/core/combatTypes';
import { EnemyAttackKind, EnemyType } from '@/core/combatTypes';
import type { EncounterConfig } from '@/dungeon/EncounterPlanner';

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

export const ENEMY_SCALING: EnemyScalingConfig = {
  hpPerFloor: 0.15,
  damagePerFloor: 0.1,
};

export const PROJECTILE_RADIUS = 4;

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
