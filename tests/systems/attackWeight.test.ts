import { describe, expect, it } from 'vitest';
import { AttackWeight } from '@/core/combatWeightTypes';
import { EliteAffix, EnemyAttackKind, EnemyType } from '@/core/combatTypes';
import { ENEMY_DEFINITIONS } from '@/config/combatConfig';
import { enemyAttackWeight, hasWindupMark } from '@/systems/AttackWeight';

const rusher = ENEMY_DEFINITIONS[EnemyType.Rusher];

describe('waga ataku wroga (krok U11b)', () => {
  it('zwykli wrogowie mają średnią wagę — bez znaku', () => {
    expect(enemyAttackWeight(ENEMY_DEFINITIONS[EnemyType.Rusher])).toBe(AttackWeight.Medium);
    expect(enemyAttackWeight(ENEMY_DEFINITIONS[EnemyType.Kiter])).toBe(AttackWeight.Medium);
    expect(hasWindupMark(AttackWeight.Medium)).toBe(false);
  });

  it('elita, skok-szarża i Czyhacz są ciężcy — pomarańczowe „!”', () => {
    expect(enemyAttackWeight({ ...rusher, affixes: [EliteAffix.Fiery] })).toBe(AttackWeight.Heavy);
    expect(enemyAttackWeight({ ...rusher, attack: { ...rusher.attack, kind: EnemyAttackKind.Pounce } as never })).toBe(AttackWeight.Heavy);
    expect(enemyAttackWeight({ ...rusher, type: EnemyType.Lurker })).toBe(AttackWeight.Heavy);
    expect(hasWindupMark(AttackWeight.Heavy)).toBe(true);
    expect(hasWindupMark(AttackWeight.Piercing)).toBe(true);
  });

  it('upiór jest lekki, nawet z cechą', () => {
    const ghost = { ...rusher, phasing: {} as never, affixes: [EliteAffix.Fiery] };
    expect(enemyAttackWeight(ghost)).toBe(AttackWeight.Light);
    expect(hasWindupMark(AttackWeight.Light)).toBe(false);
  });
});

describe('zamach do przerwania (krok U11b)', () => {
  it('isWindingUp: tylko w trwającym, nieprzerwanym zamachu', async () => {
    const { AttackCycle } = await import('@/systems/AttackCycle');
    const cycle = new AttackCycle(400, 1000);
    expect(cycle.isWindingUp(0)).toBe(false);
    cycle.tryStart(0);
    expect(cycle.isWindingUp(100)).toBe(true);
    cycle.interrupt();
    expect(cycle.isWindingUp(200)).toBe(false);
    cycle.tryStart(1000);
    expect(cycle.isWindingUp(1500)).toBe(false);
  });
});
