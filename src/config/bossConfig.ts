import type { BossDefinition } from '@/core/bossTypes';
import { BossAttackKind } from '@/core/bossTypes';
import type { EnemyScalingConfig } from '@/core/combatTypes';
import { scaleForFloor } from '@/systems/CombatMath';

/** Pierwszy boss: „Strażnik Piętra”. Sekwencja: uderzenie → pierścień pocisków → ostrzał stref. */
export const FLOOR_GUARDIAN: BossDefinition = {
  name: 'Strażnik Piętra',
  radius: 26,
  color: 0xb5452a,
  maxHp: 300,
  moveSpeed: 55,
  engageDistance: 90,
  openingDelayMs: 1200,
  restBetweenAttacksMs: 1100,
  pattern: [BossAttackKind.Slam, BossAttackKind.Nova, BossAttackKind.Barrage],
  slam: {
    radius: 100,
    telegraphMs: 900,
    recoveryMs: 400,
    damage: 18,
    knockback: 320,
  },
  nova: {
    projectileCount: 12,
    projectileSpeed: 190,
    projectileLifetimeMs: 2500,
    waves: 1,
    waveIntervalMs: 450,
    telegraphMs: 700,
    recoveryMs: 300,
    damage: 10,
    knockback: 140,
  },
  barrage: {
    zoneCount: 4,
    zoneRadius: 48,
    spread: 90,
    intervalMs: 250,
    telegraphMs: 800,
    recoveryMs: 300,
    damage: 14,
    knockback: 200,
  },
  enrage: {
    hpThreshold: 0.5,
    telegraphMultiplier: 0.75,
    restMultiplier: 0.6,
  },
};

/** Kraty areny bossa. */
export const ARENA_GATES = {
  /**
   * Kraty opadają dopiero, gdy gracz stoi co najmniej tyle kafli od krawędzi areny,
   * żeby nie spadły na niego w przejściu (gracz ma 24 px, kafel 32 px).
   */
  sealMarginTiles: 1,
  shakeDurationMs: 180,
  shakeIntensity: 0.006,
} as const;

/** Skalowanie HP i obrażeń wszystkich ataków bossa do piętra. */
export function scaleBossForFloor(boss: BossDefinition, floor: number, scaling: EnemyScalingConfig): BossDefinition {
  const dmg = (value: number): number => scaleForFloor(value, floor, scaling.damagePerFloor);
  return {
    ...boss,
    maxHp: scaleForFloor(boss.maxHp, floor, scaling.hpPerFloor),
    slam: { ...boss.slam, damage: dmg(boss.slam.damage) },
    nova: { ...boss.nova, damage: dmg(boss.nova.damage) },
    barrage: { ...boss.barrage, damage: dmg(boss.barrage.damage) },
  };
}
