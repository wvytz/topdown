import { describe, expect, it } from 'vitest';
import { HeroId } from '@/core/heroTypes';
import { ItemId } from '@/core/lootTypes';
import { RunMode } from '@/core/runMode';
import { RunState, newRun } from '@/systems/RunState';
import type { SaveData } from '@/systems/SaveGame';
import { BossSaveLock, formatSavedAt, isUnranked, itemsWord, loadFromRecord, parseSaveRecord, saveSummary, toSaveRecord } from '@/systems/SaveGame';

const data: SaveData = {
  runSeed: 123456,
  floor: 3,
  run: { hero: HeroId.Archer, gold: 540, items: [ItemId.Blade, ItemId.Quiver, ItemId.Blade], hp: 61, practice: false },
};

const roundTrip = (d: SaveData) => parseSaveRecord(JSON.stringify(toSaveRecord(d, 1_000)));

describe('zapis gry', () => {
  it('zapis i odczyt dają ten sam stan runu', () => {
    const record = roundTrip(data);
    expect(record).toEqual({ version: 1, savedAt: 1_000, ...data });
  });

  it('zachowuje tryb aren i pełne HP (null)', () => {
    const arenas: SaveData = { ...data, run: { ...newRun(HeroId.Sorceress, false, RunMode.BossRush) } };
    expect(roundTrip(arenas)?.run).toEqual({ hero: HeroId.Sorceress, gold: 0, items: [], hp: null, practice: false, mode: RunMode.BossRush });
  });

  it('stan z RunState po wczytaniu odtwarza ten sam snapshot', () => {
    const run = new RunState(data.run);
    run.addGold(10);
    const record = roundTrip({ ...data, run: run.snapshot(40) })!;
    expect(new RunState(record.run).snapshot(40)).toEqual(run.snapshot(40));
  });

  it.each([
    ['brak zapisu', null],
    ['nie-JSON', '{zepsute'],
    ['inna wersja', JSON.stringify({ ...toSaveRecord(data, 1), version: 2 })],
    ['piętro 0', JSON.stringify({ ...toSaveRecord(data, 1), floor: 0 })],
    ['ujemne złoto', JSON.stringify({ ...toSaveRecord(data, 1), run: { ...data.run, gold: -5 } })],
    ['nieznany bohater', JSON.stringify({ ...toSaveRecord(data, 1), run: { ...data.run, hero: 'nekromanta' } })],
    ['nieznany przedmiot', JSON.stringify({ ...toSaveRecord(data, 1), run: { ...data.run, items: ['miecz-zaglady'] } })],
    ['zerowe HP', JSON.stringify({ ...toSaveRecord(data, 1), run: { ...data.run, hp: 0 } })],
    ['nieznany tryb', JSON.stringify({ ...toSaveRecord(data, 1), run: { ...data.run, mode: 'hardcore' } })],
  ])('odrzuca uszkodzony zapis: %s', (_, raw) => {
    expect(parseSaveRecord(raw)).toBeNull();
  });

  it('autozapis zostaje na tablicy, ręczny slot — nie (chyba że konfiguracja pozwala)', () => {
    const record = toSaveRecord(data, 1);
    expect(isUnranked(loadFromRecord(record, 'auto', false).run)).toBe(false);
    expect(loadFromRecord(record, 'slot', false).run.fromSave).toBe(true);
    expect(isUnranked(loadFromRecord(record, 'slot', true).run)).toBe(false);
  });

  it('znacznik „z zapisu” przechodzi przez kolejne piętra i autozapis', () => {
    const loaded = loadFromRecord(toSaveRecord(data, 1), 'slot', false);
    const next = new RunState(loaded.run).snapshot(50);
    expect(next.fromSave).toBe(true);
    const again = loadFromRecord(roundTrip({ ...loaded, run: next })!, 'auto', false);
    expect(again.run.fromSave).toBe(true);
  });

  it('run testowy z adresu też jest poza tablicą', () => {
    expect(isUnranked({ practice: true })).toBe(true);
    expect(isUnranked({ practice: false })).toBe(false);
  });

  it('opis zapisu: bohater, piętro albo arena, złoto i przedmioty', () => {
    const summary = saveSummary(toSaveRecord(data, new Date(2026, 9, 22, 9, 5).getTime()));
    expect(summary.title).toBe('Łucznik · Piętro 3');
    expect(summary.details).toBe('540 złota · 3 przedmioty · 22.10 09:05');
    const arena = saveSummary(toSaveRecord({ ...data, floor: 2, run: { ...data.run, mode: RunMode.BossRush } }, 0));
    expect(arena.title).toBe('Łucznik · Arena 2');
    expect(saveSummary(toSaveRecord({ ...data, floor: 9 }, 0)).title).toBe('Łucznik · Piętro 9 · Krąg II');
  });

  it('odmiana słowa „przedmiot”', () => {
    expect([0, 1, 2, 4, 5, 12, 22, 25].map(itemsWord)).toEqual([
      'przedmiotów', 'przedmiot', 'przedmioty', 'przedmioty', 'przedmiotów', 'przedmiotów', 'przedmioty', 'przedmiotów',
    ]);
  });

  it('data zapisu w formacie dd.mm gg:mm', () => {
    expect(formatSavedAt(new Date(2026, 0, 3, 23, 59).getTime())).toBe('03.01 23:59');
  });
});

describe('zapis gry w co-opie (etap C7)', () => {
  const coop: SaveData = { ...data, coop: { hero: HeroId.Archer, items: [ItemId.Boots], hp: 40 } };

  it('pamięta partnera: bohatera, przedmioty i HP', () => {
    const record = roundTrip(coop);
    expect(record?.coop).toEqual({ hero: HeroId.Archer, items: [ItemId.Boots], hp: 40 });
    expect(loadFromRecord(record!, 'auto', false).coop).toEqual({ hero: HeroId.Archer, items: [ItemId.Boots], hp: 40 });
    expect(saveSummary(record!).title).toContain('Łucznik');
  });

  it('zapis solo nie ma partnera; uszkodzony partner unieważnia zapis', () => {
    expect(roundTrip(data)?.coop).toBeUndefined();
    const raw = JSON.stringify({ ...toSaveRecord(coop, 1_000), coop: { hero: 'smok', items: [], hp: null } });
    expect(parseSaveRecord(raw)).toBeNull();
  });
});

describe('blokada zapisu w walce z bossem (krok 121)', () => {
  const idle = { bossFighting: false, bossDefeated: false };
  const fighting = { bossFighting: true, bossDefeated: false };
  const defeated = { bossFighting: false, bossDefeated: true };

  it('we wspinaczce blokuje od przebudzenia bossa do jego śmierci', () => {
    const lock = new BossSaveLock(false);
    expect(lock.locked).toBe(false);
    expect(lock.update(idle)).toBeNull();
    expect(lock.update(fighting)).toBe('lock');
    expect(lock.locked).toBe(true);
    expect(lock.update(fighting)).toBeNull();
    expect(lock.update(defeated)).toBe('unlock');
    expect(lock.locked).toBe(false);
    expect(lock.update(defeated)).toBeNull();
  });

  it('boss, który na chwilę wypadnie z fazy walki, nie zdejmuje blokady', () => {
    const lock = new BossSaveLock(false);
    lock.update(fighting);
    expect(lock.update(idle)).toBeNull();
    expect(lock.locked).toBe(true);
  });

  it('w arenach bossów blokuje od wejścia na arenę', () => {
    const lock = new BossSaveLock(true);
    expect(lock.locked).toBe(true);
    expect(lock.update(idle)).toBeNull();
    expect(lock.update(fighting)).toBeNull();
    expect(lock.update(defeated)).toBe('unlock');
    expect(lock.locked).toBe(false);
  });

  it('po pokonaniu bossa piętro zostaje odblokowane', () => {
    const lock = new BossSaveLock(false);
    expect(lock.update(defeated)).toBeNull();
    expect(lock.update(fighting)).toBeNull();
    expect(lock.locked).toBe(false);
  });
});
