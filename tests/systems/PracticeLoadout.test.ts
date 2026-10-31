import { describe, expect, it } from 'vitest';
import { HeroId } from '@/core/heroTypes';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { PRACTICE_LOADOUT_CONFIG } from '@/config/practiceLoadoutConfig';
import { applyPracticeLoadout, simulatePracticeLoadout, wantsPracticeLoadout } from '@/systems/PracticeLoadout';
import { newRun } from '@/systems/RunState';
import { freshCoop } from '@/systems/Coop';
import { RunMode } from '@/core/runMode';

const barbarian = HERO_DEFINITIONS[HeroId.Barbarian];
const average = (field: (seed: number) => number): number => {
  let sum = 0;
  for (let seed = 1; seed <= 200; seed += 1) sum += field(seed);
  return sum / 200;
};

describe('simulatePracticeLoadout', () => {
  it('piętro 1 = puste ręce', () => {
    expect(simulatePracticeLoadout(7, 1, barbarian, PRACTICE_LOADOUT_CONFIG)).toMatchObject({ items: [], gold: 0 });
  });

  it('ten sam seed daje ten sam zestaw, inny strumień (co-op) — inny', () => {
    const a = simulatePracticeLoadout(42, 8, barbarian, PRACTICE_LOADOUT_CONFIG);
    expect(simulatePracticeLoadout(42, 8, barbarian, PRACTICE_LOADOUT_CONFIG)).toEqual(a);
    expect(simulatePracticeLoadout(42, 8, barbarian, PRACTICE_LOADOUT_CONFIG, 1).items).not.toEqual(a.items);
  });

  it('za każdego pokonanego bossa jedna karta, ukryta komnata tylko w Grzybni', () => {
    const loadout = simulatePracticeLoadout(3, 8, barbarian, PRACTICE_LOADOUT_CONFIG);
    expect(loadout.sources.boss).toBe(7);
    expect(loadout.sources.secret).toBe(1);
    expect(loadout.items).toHaveLength(Object.values(loadout.sources).reduce((a, b) => a + b, 0));
  });

  it('liczba przedmiotów rośnie z piętrem: na Wiedźmie (8) średnio 14–24', () => {
    const at = (floor: number) => average((seed) => simulatePracticeLoadout(seed, floor, barbarian, PRACTICE_LOADOUT_CONFIG).items.length);
    const witch = at(8);
    expect(at(3)).toBeLessThan(at(5));
    expect(at(5)).toBeLessThan(witch);
    expect(witch).toBeGreaterThan(14);
    expect(witch).toBeLessThan(24);
  });

  it('bez kapliczki gracz ma więcej złota', () => {
    const noShrine = { ...PRACTICE_LOADOUT_CONFIG, shrineChance: 0 };
    const always = { ...PRACTICE_LOADOUT_CONFIG, shrineChance: 1 };
    const a = simulatePracticeLoadout(9, 6, barbarian, always);
    const b = simulatePracticeLoadout(9, 6, barbarian, noShrine);
    expect(b.sources.shrine).toBe(0);
    expect(a.sources.shrine).toBeGreaterThan(0);
    expect(b.gold).toBeGreaterThan(a.gold);
  });
});

describe('wantsPracticeLoadout', () => {
  it('domyślnie włączony, ?items=0 wyłącza', () => {
    expect(wantsPracticeLoadout('?floor=8&boss=1', PRACTICE_LOADOUT_CONFIG)).toBe(true);
    expect(wantsPracticeLoadout('?floor=8&boss=1&items=0', PRACTICE_LOADOUT_CONFIG)).toBe(false);
  });
});

describe('applyPracticeLoadout', () => {
  const start = (practice: boolean, floor: number, mode = RunMode.Tower) => ({ runSeed: 5, floor, run: newRun(HeroId.Archer, practice, mode) });

  it('run testowy od piętra 8 dostaje przedmioty i złoto', () => {
    const { data, loadout } = applyPracticeLoadout({ ...start(true, 8), atBoss: true }, PRACTICE_LOADOUT_CONFIG);
    expect(loadout).not.toBeNull();
    expect(data.run.items.length).toBeGreaterThan(0);
    expect(data.run.gold).toBe(loadout!.gold);
    expect(data.atBoss).toBe(true);
    expect(data.run.practice).toBe(true);
  });

  it('run na tablicę, piętro 1 i areny bossów — bez zmian', () => {
    for (const input of [start(false, 8), start(true, 1), start(true, 4, RunMode.BossRush)]) {
      expect(applyPracticeLoadout(input, PRACTICE_LOADOUT_CONFIG)).toEqual({ data: input, loadout: null });
    }
  });

  it('w co-opie partner dostaje własny zestaw', () => {
    const { data } = applyPracticeLoadout({ ...start(true, 6), coop: freshCoop(HeroId.Sorceress) }, PRACTICE_LOADOUT_CONFIG);
    expect(data.coop!.partner.items.length).toBeGreaterThan(0);
    expect(data.coop!.partner.items).not.toEqual(data.run.items);
  });
});
