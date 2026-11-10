import type { BossDefinition } from '@/core/bossTypes';
import { scaleBossForFloor } from '@/config/bossConfig';
import type { BossEmpowerment } from '@/systems/AmbushVariants';

/**
 * Boss wzmocniony uciekającym przedmiotem zasadzki (krok 183): więcej życia, mocniejsze ciosy (wszystkie ataki
 * jak przy skalowaniu z piętrem) albo szybszy chód i krótsze przerwy między atakami.
 */
export function empowerBossDefinition<T extends BossDefinition>(boss: T, boon: BossEmpowerment): T {
  const hit = boon.damageMultiplier === 1 ? boss : scaleBossForFloor(boss, 1, { hpPerFloor: 0, damagePerFloor: 0, damageMultiplier: boon.damageMultiplier });
  const fast = boon.speedMultiplier;
  return {
    ...hit,
    maxHp: Math.round(boss.maxHp * boon.hpMultiplier),
    moveSpeed: Math.round(boss.moveSpeed * fast),
    ...(boss.sprint && { sprint: { ...boss.sprint, speed: Math.round(boss.sprint.speed * fast) } }),
    restBetweenAttacksMs: Math.round(boss.restBetweenAttacksMs / fast),
  };
}
