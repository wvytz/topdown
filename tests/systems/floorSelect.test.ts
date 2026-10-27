import { describe, expect, it } from 'vitest';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { RunMode } from '@/core/runMode';
import { HeroId } from '@/core/heroTypes';
import { BossProgress } from '@/persistence/BossProgress';
import type { KeyValueStorage } from '@/persistence/HighscoreStorage';
import { recordBossDefeat, startFloorInfo, startFloors, stepStartFloor, unlocksFloor } from '@/systems/FloorSelect';
import { RunState, newRun } from '@/systems/RunState';

describe('wybór piętra', () => {
  it('odblokowuje tylko wspinaczka i wybór piętra, bez runu testowego', () => {
    expect(unlocksFloor(RunMode.Tower, false)).toBe(true);
    expect(unlocksFloor(RunMode.FloorSelect, false)).toBe(true);
    expect(unlocksFloor(RunMode.BossRush, false)).toBe(false);
    expect(unlocksFloor(RunMode.Tower, true)).toBe(false);
  });

  it('najwyższe pokonane piętro nie maleje', () => {
    expect(recordBossDefeat(0, 3)).toBe(3);
    expect(recordBossDefeat(5, 3)).toBe(5);
  });

  it('do wyboru są piętra od 1 do najwyższego pokonanego', () => {
    expect(startFloors(0)).toEqual([1]);
    expect(startFloors(4)).toEqual([1, 2, 3, 4]);
    expect(stepStartFloor(4, 1, 4)).toBe(4);
    expect(stepStartFloor(1, -1, 4)).toBe(1);
    expect(stepStartFloor(2, 1, 4)).toBe(3);
  });

  it('opis piętra: krąg, biom i boss', () => {
    expect(startFloorInfo(2)).toEqual({ label: 'Piętro 2', biome: 'Grzybnia', boss: 'Matka i Król Pająków' });
    expect(startFloorInfo(3).boss).toBe('Grzybowy Pożeracz');
    expect(startFloorInfo(TOWER_CONFIG.floorsPerLoop + 1).label).toBe(`Piętro ${TOWER_CONFIG.floorsPerLoop + 1} · Krąg II`);
    expect(startFloorInfo(TOWER_CONFIG.floorsPerLoop + 2).boss).toBe(startFloorInfo(2).boss);
  });

  it('piętro startowe przechodzi przez kolejne piętra runu', () => {
    const run = newRun(HeroId.Archer, false, RunMode.FloorSelect, 5);
    expect(run.startFloor).toBe(5);
    expect(new RunState(run).snapshot(10).startFloor).toBe(5);
    expect(newRun(HeroId.Archer, false, RunMode.Tower, 5).startFloor).toBeUndefined();
  });

  it('BossProgress pamięta postęp i znosi zablokowany magazyn', () => {
    const data = new Map<string, string>();
    const storage: KeyValueStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    expect(new BossProgress(storage).load()).toBe(0);
    new BossProgress(storage).record(3);
    new BossProgress(storage).record(2);
    expect(new BossProgress(storage).load()).toBe(3);
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    };
    const progress = new BossProgress(blocked);
    progress.record(4);
    expect(progress.load()).toBe(4);
  });
});
