import { describe, expect, it } from 'vitest';
import { ItemId } from '@/core/lootTypes';
import { PLAYER_COMBAT } from '@/config/combatConfig';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { ITEM_DEFINITIONS, ITEM_EFFECTS, STAT_LIMITS } from '@/config/lootConfig';
import { Health } from '@/systems/Health';
import { computeLoadout, sumModifiers } from '@/systems/PlayerLoadout';
import { NEW_RUN, RunState } from '@/systems/RunState';

const loadout = (items: ItemId[]) =>
  computeLoadout(PLAYER_BASE_STATS, PLAYER_COMBAT, items, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);

describe('computeLoadout', () => {
  it('bez przedmiotów = statystyki bazowe', () => {
    const result = loadout([]);
    expect(result.stats).toEqual(PLAYER_BASE_STATS);
    expect(result.combat).toEqual(PLAYER_COMBAT);
  });

  it('każdy przedmiot zmienia właściwą statystykę', () => {
    expect(loadout([ItemId.Blade]).combat.meleeDamage).toBe(PLAYER_COMBAT.meleeDamage + 3);
    expect(loadout([ItemId.Heart]).stats.maxHp).toBe(PLAYER_BASE_STATS.maxHp + 20);
    expect(loadout([ItemId.Boots]).stats.moveSpeed).toBe(Math.round(PLAYER_BASE_STATS.moveSpeed * 1.1));
    expect(loadout([ItemId.Gloves]).combat.attackCooldownMs).toBe(Math.round(PLAYER_COMBAT.attackCooldownMs / 1.12));
    expect(loadout([ItemId.Hourglass]).combat.dash.cooldownMs).toBe(Math.round(PLAYER_COMBAT.dash.cooldownMs * 0.8));
  });

  it('przedmioty się kumulują', () => {
    expect(loadout([ItemId.Blade, ItemId.Blade, ItemId.Blade]).combat.meleeDamage).toBe(PLAYER_COMBAT.meleeDamage + 9);
    expect(sumModifiers([ItemId.Heart, ItemId.Heart], ITEM_DEFINITIONS).maxHp).toBe(40);
  });

  it('limity: cooldowny nie spadają poniżej minimum, prędkość nie przekracza maksimum', () => {
    const many = <T>(item: T, n: number): T[] => Array.from({ length: n }, () => item);
    const stacked = loadout([...many(ItemId.Gloves, 20), ...many(ItemId.Hourglass, 20), ...many(ItemId.Boots, 20)]);
    // Krok 150: Rękawice i Klepsydra mają limit 3 kopii (dalsze nic nie dają); Buty od kroku 151 znów do limitu prędkości.
    expect(stacked.combat.attackCooldownMs).toBe(Math.round(PLAYER_COMBAT.attackCooldownMs / 1.36));
    expect(stacked.combat.dash.cooldownMs).toBe(Math.round(PLAYER_COMBAT.dash.cooldownMs * STAT_LIMITS.minCooldownMultiplier));
    expect(stacked.stats.moveSpeed).toBe(Math.round(PLAYER_BASE_STATS.moveSpeed * STAT_LIMITS.maxMoveSpeedMultiplier));
    expect(stacked.stats.moveSpeed).toBeLessThanOrEqual(PLAYER_BASE_STATS.moveSpeed * STAT_LIMITS.maxMoveSpeedMultiplier);
  });

  it('krok 117: każda kopia Rękawic dodaje tyle samo tempa ataku (bez przyspieszania przyrostów)', () => {
    const many = <T>(item: T, n: number): T[] => Array.from({ length: n }, () => item);
    const rate = (n: number) => PLAYER_COMBAT.attackCooldownMs / loadout(many(ItemId.Gloves, n)).combat.attackCooldownMs;
    const gains = [1, 2, 3].map((n) => rate(n) - rate(n - 1));
    for (const gain of gains) expect(gain).toBeCloseTo(0.12, 1);
    // Krok 150: limit 3 kopie — czwarta nic nie dodaje.
    expect(rate(4)).toBeCloseTo(rate(3), 5);
  });

  it('nie zmienia obiektów bazowych', () => {
    const before = JSON.stringify([PLAYER_BASE_STATS, PLAYER_COMBAT]);
    loadout([ItemId.Blade, ItemId.Heart, ItemId.Hourglass]);
    expect(JSON.stringify([PLAYER_BASE_STATS, PLAYER_COMBAT])).toBe(before);
  });
});

describe('Health — przenoszenie i zmiana maksimum', () => {
  it('startowe HP z poprzedniego piętra (przycięte do zakresu)', () => {
    expect(new Health(100, 40).value).toBe(40);
    expect(new Health(100, 140).value).toBe(100);
  });

  it('wzrost maksimum leczy o tę samą wartość', () => {
    const hp = new Health(100, 50);
    hp.setMax(120);
    expect(hp.max).toBe(120);
    expect(hp.value).toBe(70);
  });

  it('spadek maksimum przycina bieżące HP', () => {
    const hp = new Health(100);
    hp.setMax(80);
    expect(hp.value).toBe(80);
  });

  it('isFull', () => {
    const hp = new Health(100);
    expect(hp.isFull).toBe(true);
    hp.takeDamage(1);
    expect(hp.isFull).toBe(false);
  });
});

describe('RunState', () => {
  it('nowy run jest pusty', () => {
    const run = new RunState(NEW_RUN);
    expect(run.gold).toBe(0);
    expect(run.items).toEqual([]);
  });

  it('zbiera złoto i przedmioty, liczy sztuki w kolejności zdobycia', () => {
    const run = new RunState(NEW_RUN);
    run.addGold(5);
    run.addGold(2.9);
    run.addGold(-10);
    run.addItem(ItemId.Heart);
    run.addItem(ItemId.Blade);
    run.addItem(ItemId.Heart);
    expect(run.gold).toBe(7);
    expect(run.itemCounts()).toEqual([
      { id: ItemId.Heart, count: 2 },
      { id: ItemId.Blade, count: 1 },
    ]);
  });

  it('snapshot → nowy RunState odtwarza stan (przejście między piętrami)', () => {
    const run = new RunState(NEW_RUN);
    run.addGold(12);
    run.addItem(ItemId.Boots);
    const snapshot = run.snapshot(63);
    const next = new RunState(snapshot);
    expect(snapshot.hp).toBe(63);
    expect(next.gold).toBe(12);
    expect(next.items).toEqual([ItemId.Boots]);
  });

  it('snapshot jest niezależną kopią', () => {
    const run = new RunState(NEW_RUN);
    const snapshot = run.snapshot(null);
    run.addItem(ItemId.Blade);
    expect(snapshot.items).toEqual([]);
  });
});
