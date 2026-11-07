import { describe, expect, it } from 'vitest';
import { BIOMES } from '@/config/biomeConfig';
import { ENEMY_DEFINITIONS, ENEMY_SCALING, ENEMY_VARIANTS } from '@/config/combatConfig';
import { BARBARIAN_COMBAT } from '@/config/heroConfig';
import { HORDE_CONFIG } from '@/config/hordeConfig';
import { EnemyType } from '@/core/combatTypes';
import { RoomKind } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { scaleForFloor } from '@/systems/CombatMath';
import { enemyDefinitionFor } from '@/systems/EnemyVariants';
import { HordePhase, HordeRoomState, hordeMinionVariant, hordeRoomForSpawn, hordeWaveSize, isInsideRoom, planHordeRooms } from '@/systems/Horde';
import { sampleFloors } from '../helpers/floors';

const STATE_CONFIG = HORDE_CONFIG;

describe('Nawała — plan pokojów (krok 175)', () => {
  it('tylko zwykłe pokoje; od piętra 3 każdy, na piętrze 1 mniej więcej co drugi', () => {
    let rooms1 = 0;
    let horde1 = 0;
    sampleFloors([1, 3], 20).forEach((floor, i) => {
      const floorNumber = i < 20 ? 1 : 3;
      const plans = planHordeRooms(floor, floorNumber, HORDE_CONFIG, false, createRng(i));
      for (const plan of plans) expect(floor.rooms[plan.roomId]!.kind).toBe(RoomKind.Normal);
      const normal = floor.rooms.filter((r) => r.kind === RoomKind.Normal).length;
      if (floorNumber === 3) expect(plans.length).toBe(normal);
      else {
        rooms1 += normal;
        horde1 += plans.length;
      }
    });
    expect(horde1 / rooms1).toBeGreaterThan(0.3);
    expect(horde1 / rooms1).toBeLessThan(0.7);
  });

  it('więcej fal i liczniejsze fale z piętrem, z sufitem; co-op dokłada stworki', () => {
    expect(hordeWaveSize(HORDE_CONFIG, 1)).toBe(HORDE_CONFIG.perWave.base);
    expect(hordeWaveSize(HORDE_CONFIG, 7)).toBeGreaterThan(hordeWaveSize(HORDE_CONFIG, 1));
    expect(hordeWaveSize(HORDE_CONFIG, 50)).toBe(HORDE_CONFIG.perWave.max);
    const floor = sampleFloors([5], 1)[0]!;
    const solo = planHordeRooms(floor, 5, HORDE_CONFIG, false, createRng(1))[0]!;
    const coop = planHordeRooms(floor, 5, HORDE_CONFIG, true, createRng(1))[0]!;
    expect(solo.waves.length).toBe(HORDE_CONFIG.wavesByFloor[4]);
    expect(coop.waves[0]).toBe(solo.waves[0]! + HORDE_CONFIG.coopExtraPerWave);
  });

  it('próg drzwi nie budzi nawały, głąb pokoju tak', () => {
    const room = { id: 0, x: 10, y: 10, width: 6, height: 6, kind: RoomKind.Normal };
    expect(isInsideRoom(room, { x: 10, y: 12 }, 1)).toBe(false);
    expect(isInsideRoom(room, { x: 11, y: 12 }, 1)).toBe(true);
    expect(isInsideRoom(room, { x: 15, y: 12 }, 1)).toBe(false);
  });
});

describe('Nawała — fale', () => {
  const plan = { roomId: 0, waves: [5, 5, 5] };

  it('śpi do wejścia, pierwsza fala po opóźnieniu', () => {
    const state = new HordeRoomState(plan, STATE_CONFIG);
    expect(state.update(0, 0)).toBe(0);
    state.wake(1000);
    expect(state.update(1000, 0)).toBe(0);
    expect(state.update(1000 + STATE_CONFIG.firstWaveDelayMs, 0)).toBe(5);
  });

  it('kolejna fala, gdy poprzednia prawie wybita albo po czasie; potem koniec po wybiciu', () => {
    const state = new HordeRoomState(plan, STATE_CONFIG);
    state.wake(0);
    const t0 = STATE_CONFIG.firstWaveDelayMs;
    expect(state.update(t0, 0)).toBe(5);
    expect(state.update(t0 + 100, 5)).toBe(0);
    expect(state.update(t0 + 200, STATE_CONFIG.nextWhenAliveAtMost)).toBe(5);
    expect(state.update(t0 + 300, 7)).toBe(0);
    expect(state.update(t0 + 300 + STATE_CONFIG.nextWaveAfterMs, 7)).toBe(5);
    expect(state.exhausted).toBe(true);
    expect(state.update(t0 + 99_999, 3)).toBe(0);
    expect(state.currentPhase).toBe(HordePhase.Active);
    state.update(t0 + 100_000, 0);
    expect(state.currentPhase).toBe(HordePhase.Done);
  });

  it('budzi się raz', () => {
    const state = new HordeRoomState(plan, STATE_CONFIG);
    state.wake(0);
    state.wake(5000);
    expect(state.update(STATE_CONFIG.firstWaveDelayMs, 0)).toBe(5);
  });

  it('sufit żywych wrogów', () => {
    expect(hordeRoomForSpawn(6, 10, HORDE_CONFIG.maxAliveEnemies)).toBe(6);
    expect(hordeRoomForSpawn(6, HORDE_CONFIG.maxAliveEnemies - 2, HORDE_CONFIG.maxAliveEnemies)).toBe(2);
    expect(hordeRoomForSpawn(6, HORDE_CONFIG.maxAliveEnemies + 3, HORDE_CONFIG.maxAliveEnemies)).toBe(0);
  });
});

describe('Nawała — stworki biomów i balans', () => {
  const nesterAttack = ENEMY_DEFINITIONS[EnemyType.Nester].attack;

  it('każdy biom ma stworka nawały (tego z gniazda)', () => {
    for (const biome of Object.values(BIOMES)) {
      const minion = hordeMinionVariant(biome.enemyVariants, ENEMY_VARIANTS, nesterAttack);
      expect(minion, biome.id).not.toBeNull();
      expect(ENEMY_VARIANTS[minion!].type).toBe(EnemyType.Rusher);
    }
  });

  it('stworek pada od 1 ciosu barbarzyńcy na piętrze 1 i od 2 na piętrze 7', () => {
    for (const biome of Object.values(BIOMES)) {
      const minion = hordeMinionVariant(biome.enemyVariants, ENEMY_VARIANTS, nesterAttack)!;
      const def = enemyDefinitionFor(ENEMY_DEFINITIONS[EnemyType.Rusher], minion, ENEMY_VARIANTS);
      const hit = BARBARIAN_COMBAT.meleeDamage;
      expect(scaleForFloor(def.maxHp, 1, ENEMY_SCALING.hpPerFloor)).toBeLessThanOrEqual(hit);
      expect(scaleForFloor(def.maxHp, 7, ENEMY_SCALING.hpPerFloor)).toBeLessThanOrEqual(2 * hit);
    }
  });

  it('sufit żywych zmieści pokój z największą falą co-opu i jego zwykłych wrogów', () => {
    expect(HORDE_CONFIG.maxAliveEnemies).toBeGreaterThanOrEqual(HORDE_CONFIG.perWave.max + HORDE_CONFIG.coopExtraPerWave + 3);
  });
});
