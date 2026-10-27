import { describe, expect, it } from 'vitest';
import { ArenaPhase, BossRushArena, arenaLabel, isBossRush, nextRunMode, parseRunMode } from '@/systems/BossRush';
import { RunMode } from '@/core/runMode';
import { RunState, newRun } from '@/systems/RunState';
import { HeroId } from '@/core/heroTypes';
import { BOSS_RUSH_CONFIG } from '@/config/bossRushConfig';
import { TOWER_CONFIG } from '@/config/towerConfig';

const state = (over: Partial<{ bossDefeated: boolean; enemiesAlive: number; playerDead: boolean; now: number }> = {}) => ({
  bossDefeated: false,
  enemiesAlive: 0,
  playerDead: false,
  now: 0,
  ...over,
});

describe('areny bossów — przebieg areny (krok 90)', () => {
  it('póki boss żyje, nic się nie dzieje', () => {
    const arena = new BossRushArena(1000);
    expect(arena.update(state({ enemiesAlive: 3 }))).toBeNull();
    expect(arena.phase).toBe(ArenaPhase.Fight);
  });

  it('boss pokonany i arena pusta: od razu nagroda, po wyborze teleport po odliczaniu', () => {
    const arena = new BossRushArena(1000);
    expect(arena.update(state({ bossDefeated: true }))).toBe('offer-reward');
    expect(arena.update(state({ bossDefeated: true, now: 50 }))).toBeNull();
    arena.rewardTaken();
    expect(arena.phase).toBe(ArenaPhase.Teleport);
    // Odliczanie od pierwszej klatki po wyborze (scena stała, gdy gracz wybierał).
    expect(arena.update(state({ bossDefeated: true, now: 100 }))).toBeNull();
    expect(arena.update(state({ bossDefeated: true, now: 1099 }))).toBeNull();
    expect(arena.update(state({ bossDefeated: true, now: 1100 }))).toBe('teleport');
    expect(arena.phase).toBe(ArenaPhase.Done);
    expect(arena.update(state({ bossDefeated: true, now: 5000 }))).toBeNull();
  });

  it('pomocnicy na arenie: najpierw komunikat, nagroda dopiero po ostatnim', () => {
    const arena = new BossRushArena(1000);
    expect(arena.update(state({ bossDefeated: true, enemiesAlive: 2 }))).toBe('announce-clear');
    expect(arena.update(state({ bossDefeated: true, enemiesAlive: 1 }))).toBeNull();
    expect(arena.phase).toBe(ArenaPhase.Clearing);
    expect(arena.update(state({ bossDefeated: true, enemiesAlive: 0 }))).toBe('offer-reward');
  });

  it('martwy gracz nie dostaje nagrody ani teleportu', () => {
    const arena = new BossRushArena(0);
    expect(arena.update(state({ bossDefeated: true, playerDead: true }))).toBeNull();
    expect(arena.phase).toBe(ArenaPhase.Fight);
  });

  it('wybór nagrody poza fazą nagrody nic nie zmienia', () => {
    const arena = new BossRushArena(0);
    arena.rewardTaken();
    expect(arena.phase).toBe(ArenaPhase.Fight);
  });
});

describe('areny bossów — tryb runu', () => {
  it('tryb z adresu tylko dla dokładnej wartości', () => {
    const { urlParam, urlValue } = BOSS_RUSH_CONFIG;
    expect(parseRunMode(`?${urlParam}=${urlValue}`, urlParam, urlValue)).toBe(RunMode.BossRush);
    expect(parseRunMode('?mode=tower', urlParam, urlValue)).toBeNull();
    expect(parseRunMode('', urlParam, urlValue)).toBeNull();
  });

  it('tryb przechodzi przez kolejne areny, a zwykły run zostaje bez pola (zgodność wsteczna)', () => {
    const rush = new RunState(newRun(HeroId.Archer, false, RunMode.BossRush));
    expect(rush.mode).toBe(RunMode.BossRush);
    expect(rush.snapshot(20).mode).toBe(RunMode.BossRush);
    expect(isBossRush(rush.snapshot(20).mode)).toBe(true);
    const tower = new RunState(newRun(HeroId.Archer));
    expect(tower.mode).toBe(RunMode.Tower);
    expect('mode' in tower.snapshot(null)).toBe(false);
    expect(isBossRush(undefined)).toBe(false);
  });

  it('przełącznik trybów na ekranie wyboru', () => {
    expect(nextRunMode(RunMode.Tower)).toBe(RunMode.BossRush);
    expect(nextRunMode(RunMode.BossRush)).toBe(RunMode.Tower);
  });

  it('napis areny w HUD, w kolejnych kręgach z kręgiem', () => {
    expect(arenaLabel(2, 'Matka Pająków', TOWER_CONFIG)).toBe('Arena 2 · Matka Pająków');
    expect(arenaLabel(TOWER_CONFIG.floorsPerLoop + 1, 'Strażnik Piętra', TOWER_CONFIG)).toBe(`Arena ${TOWER_CONFIG.floorsPerLoop + 1} · Strażnik Piętra · Krąg II`);
  });
});
