import { describe, expect, it } from 'vitest';
import { EnemyType } from '@/core/combatTypes';
import { ENEMY_SCALING, ENEMY_DEFINITIONS, ENEMY_STATUS_RESISTANCE, PLAYER_COMBAT, getEncounterConfigForFloor } from '@/config/combatConfig';
import { FLOOR_GUARDIAN, scaleBossForFloor } from '@/config/bossConfig';
import { getDungeonConfigForFloor } from '@/config/gameConfig';
import { BOSS_LOOT, ENEMY_LOOT, ITEM_EFFECTS, LOOT_SCALING, SHRINE_CONFIG } from '@/config/lootConfig';
import { scaleForFloor } from '@/systems/CombatMath';
import { scaleEnemyForFloor } from '@/systems/EnemyScaling';
import { shrineCost } from '@/systems/Shrine';

/**
 * Testy balansu: pilnują kształtu krzywej trudności i relacji między liczbami z config/.
 * To nie są testy „dokładnych wartości” — progi są szerokie, żeby strojenie nie wymagało
 * poprawiania testów, ale wyłapuje rozjechanie się krzywej (np. wróg nie do zabicia, efekt przedmiotu
 * silniejszy niż obrażenia, które ma równoważyć).
 */

const FLOORS = Array.from({ length: 10 }, (_, i) => i + 1);
const hitsToKill = (hp: number, damage: number): number => Math.ceil(hp / damage);
const average = (range: { min: number; max: number }): number => (range.min + range.max) / 2;

/** DPS wroga wręcz przy ciągłych atakach (cooldown liczony od startu zamachu). */
const rusherDps = (floor: number): number => {
  const rusher = scaleEnemyForFloor(ENEMY_DEFINITIONS[EnemyType.Rusher], floor, ENEMY_SCALING);
  return (rusher.attack.damage * 1000) / rusher.attack.cooldownMs;
};

/** Oczekiwane złoto z piętra: wrogowie (średnio) + boss, ze skalowaniem. */
const expectedGold = (floor: number): number => {
  const dungeon = getDungeonConfigForFloor(floor);
  const encounters = getEncounterConfigForFloor(floor);
  const normalRooms = average(dungeon.roomCount) - 2; // bez pokoju startowego i areny
  const enemies = normalRooms * average(encounters.enemiesPerRoom);
  const goldPerEnemy = (type: EnemyType): number =>
    ENEMY_LOOT[type].goldChance * scaleForFloor(average(ENEMY_LOOT[type].gold), floor, LOOT_SCALING.goldPerFloor);
  const enemyGold =
    enemies * (encounters.kiterChance * goldPerEnemy(EnemyType.Kiter) + (1 - encounters.kiterChance) * goldPerEnemy(EnemyType.Rusher));
  return enemyGold + scaleForFloor(average(BOSS_LOOT.gold), floor, LOOT_SCALING.goldPerFloor);
};

describe('balans: krzywa trudności', () => {
  it('piętro 1: Rusher pada od 3 ciosów, Kiter od 2', () => {
    expect(hitsToKill(ENEMY_DEFINITIONS[EnemyType.Rusher].maxHp, PLAYER_COMBAT.meleeDamage)).toBe(3);
    expect(hitsToKill(ENEMY_DEFINITIONS[EnemyType.Kiter].maxHp, PLAYER_COMBAT.meleeDamage)).toBe(2);
  });

  it('bez żadnych przedmiotów wróg na piętrze 10 wciąż pada od rozsądnej liczby ciosów (≤ 7)', () => {
    for (const type of Object.values(EnemyType)) {
      const enemy = scaleEnemyForFloor(ENEMY_DEFINITIONS[type], 10, ENEMY_SCALING);
      expect(hitsToKill(enemy.maxHp, PLAYER_COMBAT.meleeDamage)).toBeLessThanOrEqual(7);
    }
  });

  it('trudność rośnie z piętrem (HP i obrażenia wrogów i bossa nie maleją)', () => {
    for (const floor of FLOORS.slice(1)) {
      const now = scaleEnemyForFloor(ENEMY_DEFINITIONS[EnemyType.Rusher], floor, ENEMY_SCALING);
      const before = scaleEnemyForFloor(ENEMY_DEFINITIONS[EnemyType.Rusher], floor - 1, ENEMY_SCALING);
      expect(now.maxHp).toBeGreaterThanOrEqual(before.maxHp);
      expect(now.attack.damage).toBeGreaterThanOrEqual(before.attack.damage);
      expect(scaleBossForFloor(FLOOR_GUARDIAN, floor, ENEMY_SCALING).maxHp).toBeGreaterThan(
        scaleBossForFloor(FLOOR_GUARDIAN, floor - 1, ENEMY_SCALING).maxHp,
      );
    }
  });

  it('boss na piętrze 1 wymaga 20–30 ciosów bez przedmiotów (walka, nie formalność)', () => {
    const hits = hitsToKill(FLOOR_GUARDIAN.maxHp, PLAYER_COMBAT.meleeDamage);
    expect(hits).toBeGreaterThanOrEqual(20);
    expect(hits).toBeLessThanOrEqual(30);
  });

  it('strzał zostaje słabszy od ciosu, ale pełna seria ładunków zabija Kitera z piętra 1', () => {
    expect(PLAYER_COMBAT.ranged.damage).toBeLessThan(PLAYER_COMBAT.meleeDamage);
    expect(PLAYER_COMBAT.ranged.damage * PLAYER_COMBAT.ranged.maxCharges).toBeGreaterThanOrEqual(
      ENEMY_DEFINITIONS[EnemyType.Kiter].maxHp,
    );
  });
});

describe('balans: ekonomia', () => {
  it('ofiara w kapliczce kosztuje 25–60% oczekiwanego złota z piętra na każdym piętrze 1–10', () => {
    for (const floor of FLOORS) {
      const ratio = shrineCost(floor, SHRINE_CONFIG) / expectedGold(floor);
      expect(ratio, `piętro ${floor}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(0.25);
      expect(ratio, `piętro ${floor}: ${ratio.toFixed(2)}`).toBeLessThanOrEqual(0.6);
    }
  });
});

describe('balans: przedmioty z efektem', () => {
  it('Wampirzy kieł (1 kopia) leczy najwyżej ~1/3 tego, co zadaje jeden Rusher — na każdym piętrze', () => {
    // Bez odstępu między leczeniami kieł dawał 2 HP co cios (co 0,32 s) = 6,25 HP/s, czyli ok. 60% DPS Rushera.
    const fang = ITEM_EFFECTS.vampireFang;
    const interval = Math.max(fang.cooldownMs, PLAYER_COMBAT.attackCooldownMs);
    const healPerSecond = (fang.heal * 1000) / interval;
    for (const floor of FLOORS) expect(healPerSecond).toBeLessThanOrEqual(rusherDps(floor) * 0.35);
  });

  it('Elektryczna strzała (1–2 kopie) nie trzyma zwykłego wroga w ogłuszeniu dłużej niż połowę czasu', () => {
    const { stunMs, stunMsPerStack } = ITEM_EFFECTS.electricArrow;
    for (const stacks of [1, 2]) {
      const stun = (stunMs + (stacks - 1) * stunMsPerStack) * ENEMY_STATUS_RESISTANCE.stunMultiplier;
      const uptime = stun / (stun + ENEMY_STATUS_RESISTANCE.stunImmunityMs);
      expect(uptime, `${stacks} kopie: ${(uptime * 100).toFixed(0)}%`).toBeLessThanOrEqual(0.5);
    }
  });

  it('podpalenie (1 kopia) dodaje mniej niż połowę obrażeń ciągłych ciosów', () => {
    const fire = ITEM_EFFECTS.fireFist;
    const burnDps = (fire.tickDamage * 1000) / fire.tickMs;
    const meleeDps = (PLAYER_COMBAT.meleeDamage * 1000) / PLAYER_COMBAT.attackCooldownMs;
    expect(burnDps).toBeLessThan(meleeDps / 2);
  });
});
