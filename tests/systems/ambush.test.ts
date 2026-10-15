import { describe, expect, it } from 'vitest';
import { RoomKind } from '@/core/dungeonTypes';
import { EnemyType, EnemyVariant } from '@/core/combatTypes';
import { createRng } from '@/core/random';
import { AMBUSH_CONFIG } from '@/config/ambushConfig';
import { ENEMY_DEFINITIONS, ENEMY_VARIANTS, getEncounterConfigForFloor } from '@/config/combatConfig';
import { ENEMY_VISUALS } from '@/config/spriteConfig';
import { planAmbushRoom } from '@/dungeon/AmbushPlanner';
import { planEncounters } from '@/dungeon/EncounterPlanner';
import { planShrineLocation } from '@/dungeon/ShrinePlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { AmbushPhase, AmbushState, ambushSpawnTiles, hasAmbush, isPhased } from '@/systems/Ambush';
import { enemyDefinitionFor } from '@/systems/EnemyVariants';
import { sampleFloors } from '../helpers/floors';

describe('harmonogram zasadzek (krok 49)', () => {
  it('pierwsza na piętrze 1–2, potem co 1–2 piętra; deterministycznie z seeda runu', () => {
    for (let seed = 0; seed < 50; seed++) {
      const floors = Array.from({ length: 20 }, (_, i) => i + 1).filter((f) => hasAmbush(seed, f, AMBUSH_CONFIG));
      expect(floors[0]).toBeLessThanOrEqual(2);
      for (let i = 1; i < floors.length; i++) {
        expect(floors[i]! - floors[i - 1]!).toBeGreaterThanOrEqual(1);
        expect(floors[i]! - floors[i - 1]!).toBeLessThanOrEqual(2);
      }
      expect(floors).toEqual(Array.from({ length: 20 }, (_, i) => i + 1).filter((f) => hasAmbush(seed, f, AMBUSH_CONFIG)));
    }
  });
});

describe('pokój zasadzki', () => {
  it('zwykły pokój dość duży; potem bez wrogów i kapliczki', () => {
    for (const [i, floor] of sampleFloors([3], 20).entries()) {
      const plan = planAmbushRoom(floor, AMBUSH_CONFIG.minSide, createRng(i));
      if (!plan) continue;
      const room = plan.floor.rooms[plan.roomId]!;
      expect(room.kind).toBe(RoomKind.Ambush);
      expect(floor.rooms[plan.roomId]!.kind).toBe(RoomKind.Normal);
      expect(Math.min(room.width, room.height)).toBeGreaterThanOrEqual(AMBUSH_CONFIG.minSide);
      for (const s of planEncounters(plan.floor, getEncounterConfigForFloor(3), createRng(1))) expect(roomContainsTile(room, s.tile)).toBe(false);
      const shrine = planShrineLocation(plan.floor, createRng(2));
      if (shrine) expect(roomContainsTile(room, shrine)).toBe(false);
    }
  });

  it('upiory pojawiają się w pokoju, z dala od gracza', () => {
    const room = { id: 0, x: 2, y: 2, width: 9, height: 8, kind: RoomKind.Ambush };
    const player = { x: 6, y: 6 };
    const tiles = ambushSpawnTiles(room, player, 4, AMBUSH_CONFIG.minSpawnDistance, createRng(3));
    expect(tiles).toHaveLength(4);
    expect(new Set(tiles.map((t) => `${t.x},${t.y}`)).size).toBe(4);
    for (const t of tiles) {
      expect(roomContainsTile(room, t)).toBe(true);
      expect(Math.max(Math.abs(t.x - player.x), Math.abs(t.y - player.y))).toBeGreaterThanOrEqual(AMBUSH_CONFIG.minSpawnDistance);
    }
  });
});

describe('przebieg zasadzki', () => {
  it('wejście → kraty → fale po kolei → koniec', () => {
    const state = new AmbushState(AMBUSH_CONFIG);
    const step = (inside: boolean, alive: number, now: number) => state.update({ playerInside: inside, playerDead: false, aliveInWave: alive }, now);
    expect(step(false, 0, 0)).toBeNull();
    expect(step(true, 0, 100)).toEqual({ kind: 'seal' });
    expect(step(true, 0, 100 + AMBUSH_CONFIG.waveDelayMs - 1)).toBeNull();
    expect(step(true, 0, 100 + AMBUSH_CONFIG.waveDelayMs)).toEqual({ kind: 'wave', index: 0, count: AMBUSH_CONFIG.waves[0] });
    expect(step(true, 3, 2000)).toBeNull();
    expect(step(true, 0, 2100)).toBeNull(); // przerwa przed kolejną falą
    expect(step(true, 0, 2100 + AMBUSH_CONFIG.waveDelayMs)).toEqual({ kind: 'wave', index: 1, count: AMBUSH_CONFIG.waves[1] });
    expect(step(true, 0, 5000)).toEqual({ kind: 'clear' });
    expect(state.phase).toBe(AmbushPhase.Cleared);
    expect(step(true, 0, 6000)).toBeNull();
  });
});

describe('upiór', () => {
  const ghost = enemyDefinitionFor(ENEMY_DEFINITIONS[EnemyType.Rusher], EnemyVariant.Ghost, ENEMY_VARIANTS);

  it('przenika na przemian; dotyk spowalnia; ma własny wygląd', () => {
    const p = ghost.phasing!;
    expect(isPhased(p, 0, 0)).toBe(false);
    expect(isPhased(p, 0, p.solidMs)).toBe(true);
    expect(isPhased(p, 0, p.solidMs + p.phasedMs)).toBe(false);
    expect(p.solidMs).toBeGreaterThan(p.phasedMs);
    expect(ghost.attack.kind === 'melee' && ghost.attack.status?.slow).toBeTruthy();
    expect(ENEMY_VISUALS[EnemyVariant.Ghost].sheet).toBe('ghost');
  });
});
