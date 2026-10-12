import type { EnemyDefinition, EnemyScalingConfig } from '@/core/combatTypes';
import { scaleForFloor } from '@/systems/CombatMath';

/** Zwraca kopię definicji z HP i obrażeniami przeskalowanymi do piętra. */
export function scaleEnemyForFloor(
  definition: EnemyDefinition,
  floor: number,
  scaling: EnemyScalingConfig,
): EnemyDefinition {
  return {
    ...definition,
    maxHp: scaleForFloor(definition.maxHp, floor, scaling.hpPerFloor),
    attack: {
      ...definition.attack,
      damage: scaleForFloor(definition.attack.damage, floor, scaling.damagePerFloor),
    },
  };
}
