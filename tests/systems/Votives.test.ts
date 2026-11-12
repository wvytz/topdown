import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, ITEM_DEFINITIONS, ITEM_POOL } from '@/config/lootConfig';
import { KILN_CONFIG, VOTIVE_CONFIG, VOTIVE_ORDER } from '@/config/votiveConfig';
import { ItemId, ItemKind } from '@/core/lootTypes';
import { createRng } from '@/core/random';
import { HeroId } from '@/core/heroTypes';
import { RunMode } from '@/core/runMode';
import { EMPTY_META, burnVotive, cycleStartItem, findVotive, knownVotives, parseMetaProfile } from '@/systems/MetaProgress';
import { newRun } from '@/systems/RunState';
import { GuideRescue, NO_WARD_EFFECTS, PoisonWard, computeWardEffects, poolWithVotives, votiveToFind, wardedHitDamage, withStartItem } from '@/systems/Votives';

describe('wota — ochrona (krok Z3)', () => {
  it('pierwsze cztery wota to przedmioty ochronne poza pulą Aktu I', () => {
    expect(VOTIVE_ORDER).toHaveLength(4);
    for (const id of VOTIVE_ORDER) expect(ITEM_DEFINITIONS[id].kind).toBe(ItemKind.Votive);
    expect(ITEM_POOL.some((item) => item.kind === ItemKind.Votive)).toBe(false);
  });

  it('Pancerz i Rdzeń: 50% na kopię, dwie kopie — pełna odporność', () => {
    expect(computeWardEffects([], VOTIVE_CONFIG)).toEqual(NO_WARD_EFFECTS);
    expect(computeWardEffects([ItemId.Carapace], VOTIVE_CONFIG).poisonResist).toBe(0.5);
    expect(computeWardEffects([ItemId.Carapace, ItemId.Carapace, ItemId.Carapace], VOTIVE_CONFIG).poisonResist).toBe(1);
    const core = computeWardEffects([ItemId.ShieldCore], VOTIVE_CONFIG);
    expect(wardedHitDamage(12, 'fire', core)).toBe(6);
    expect(wardedHitDamage(12, undefined, core)).toBe(12);
    expect(wardedHitDamage(12, 'fire', computeWardEffects([ItemId.ShieldCore, ItemId.ShieldCore], VOTIVE_CONFIG))).toBe(0);
  });

  it('Kamienna łuska ścina malejąco, do sufitu, i nigdy do zera', () => {
    const one = computeWardEffects([ItemId.StoneScale], VOTIVE_CONFIG).damageReduction;
    const two = computeWardEffects([ItemId.StoneScale, ItemId.StoneScale], VOTIVE_CONFIG).damageReduction;
    expect(one).toBeCloseTo(0.08);
    expect(two - one).toBeLessThan(one);
    expect(computeWardEffects(Array(20).fill(ItemId.StoneScale), VOTIVE_CONFIG).damageReduction).toBe(VOTIVE_CONFIG.stoneScale.max);
    expect(wardedHitDamage(1, undefined, computeWardEffects([ItemId.StoneScale], VOTIVE_CONFIG))).toBe(1);
  });

  it('trucizna po Pancerzu nie gubi ułamków', () => {
    const ward = new PoisonWard();
    const ticks = [1, 1, 1, 1].map((damage) => ward.reduce(damage, 0.5));
    expect(ticks.reduce((a, b) => a + b, 0)).toBe(2);
    expect(new PoisonWard().reduce(4, 1)).toBe(0);
    expect(new PoisonWard().reduce(4, 0)).toBe(4);
  });

  it('Kość psa-przewodnika ratuje raz, a druga kopia leczy przy ratunku', () => {
    const one = computeWardEffects([ItemId.GuideBone], VOTIVE_CONFIG).rescue;
    const rescue = new GuideRescue();
    expect(rescue.tryRescue(50, 10, 100, one)).toBeNull();
    expect(rescue.tryRescue(10, 30, 100, one)).toBe(1);
    expect(rescue.tryRescue(10, 30, 100, one)).toBeNull();
    const two = computeWardEffects([ItemId.GuideBone, ItemId.GuideBone, ItemId.GuideBone], VOTIVE_CONFIG).rescue;
    expect(new GuideRescue().tryRescue(10, 30, 100, two)).toBe(10);
    expect(new GuideRescue().tryRescue(10, 30, 100, null)).toBeNull();
  });
});

describe('Piec wotów i przedmiot startowy (krok Z3)', () => {
  it('znalezienie: bez powtórek, z nieznanych; wszystkie znane — nic', () => {
    const found = findVotive(EMPTY_META, ItemId.Carapace);
    expect(findVotive(found, ItemId.Carapace)).toBe(found);
    const next = votiveToFind(VOTIVE_ORDER, knownVotives(found), createRng(7));
    expect(next).not.toBeNull();
    expect(next).not.toBe(ItemId.Carapace);
    expect(votiveToFind(VOTIVE_ORDER, VOTIVE_ORDER, createRng(7))).toBeNull();
  });

  it('wypalenie kosztuje Żar, wchodzi do puli i staje się przedmiotem startowym', () => {
    const found = { ...findVotive(EMPTY_META, ItemId.StoneScale), embers: KILN_CONFIG.burnCost - 1 };
    expect(burnVotive(found, ItemId.StoneScale, KILN_CONFIG.burnCost)).toBe(found);
    const burned = burnVotive({ ...found, embers: 40 }, ItemId.StoneScale, KILN_CONFIG.burnCost);
    expect(burned.embers).toBe(40 - KILN_CONFIG.burnCost);
    expect(burned.foundVotives).toEqual([]);
    expect(burned.burnedVotives).toEqual([ItemId.StoneScale]);
    expect(burned.startItem).toBe(ItemId.StoneScale);
    const pool = poolWithVotives(ALL_ITEMS, burned.burnedVotives);
    expect(pool.map((item) => item.id)).toContain(ItemId.StoneScale);
    expect(pool.map((item) => item.id)).not.toContain(ItemId.Carapace);
    expect(pool.some((item) => item.kind === ItemKind.Relic)).toBe(false);
  });

  it('Palenisko przełącza przedmiot startowy, a profil przechodzi przez zapis', () => {
    const profile = { ...EMPTY_META, burnedVotives: [ItemId.Carapace, ItemId.GuideBone], startItem: ItemId.Carapace };
    const second = cycleStartItem(profile);
    expect(second.startItem).toBe(ItemId.GuideBone);
    expect(cycleStartItem(second).startItem).toBeNull();
    expect(cycleStartItem(cycleStartItem(second)).startItem).toBe(ItemId.Carapace);
    expect(cycleStartItem(EMPTY_META)).toBe(EMPTY_META);
    expect(parseMetaProfile(JSON.stringify(second), VOTIVE_ORDER)).toEqual(second);
    // Obce wota odpadają, przedmiot startowy musi być wypalony.
    const odd = parseMetaProfile(JSON.stringify({ ...second, foundVotives: ['x', ItemId.GuideBone], startItem: ItemId.StoneScale }), VOTIVE_ORDER);
    expect(odd.foundVotives).toEqual([]);
    expect(odd.startItem).toBeNull();
  });

  it('przedmiot startowy dostaje tylko świeże Zejście na pierwszym piętrze', () => {
    const run = newRun(HeroId.Barbarian, false, RunMode.Descent, 1);
    expect(withStartItem(run, 1, 1, ItemId.Carapace).items).toEqual([ItemId.Carapace]);
    expect(withStartItem(run, 2, 1, ItemId.Carapace)).toBe(run);
    expect(withStartItem(run, 1, 1, null)).toBe(run);
    expect(withStartItem({ ...run, fromSave: true }, 1, 1, ItemId.Carapace).items).toEqual([]);
    expect(withStartItem(newRun(HeroId.Barbarian), 1, 1, ItemId.Carapace).items).toEqual([]);
  });
});
