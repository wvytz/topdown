import { describe, expect, it } from 'vitest';
import type { FloorModifierEffects } from '@/core/floorModifierTypes';
import { HeroId, archeryOf } from '@/core/heroTypes';
import { ItemId } from '@/core/lootTypes';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { ITEM_DEFINITIONS, ITEM_EFFECTS, STAT_LIMITS } from '@/config/lootConfig';
import { BowRepeater, arrowSpec, volleyDirections } from '@/systems/Archery';
import { applyFloorToLoadout } from '@/systems/FloorModifiers';
import { computeHeroLoadout } from '@/systems/PlayerLoadout';

const archer = HERO_DEFINITIONS[HeroId.Archer];
const barbarian = HERO_DEFINITIONS[HeroId.Barbarian];
const sorceress = HERO_DEFINITIONS[HeroId.Sorceress];
const bow = archeryOf(archer.kit)!.bow;
const loadout = (items: ItemId[] = []) => computeHeroLoadout(archer, items, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);

describe('łucznik: bohater', () => {
  it('HP między barbarzyńcą a Czarodziejką, najszybszy chód (krok 82)', () => {
    expect(archer.stats.maxHp).toBeLessThan(barbarian.stats.maxHp);
    expect(archer.stats.maxHp).toBeGreaterThan(sorceress.stats.maxHp);
    expect(archer.stats.moveSpeed).toBeGreaterThan(barbarian.stats.moveSpeed);
    expect(archer.kit.kind).toBe('archery');
    expect(archeryOf(barbarian.kit)).toBeNull();
  });

  it('mocna strzała zadaje więcej niż strzał barbarzyńcy; zwykła nie mniej (krok 97)', () => {
    expect(arrowSpec(bow, true).damage).toBeGreaterThan(barbarian.combat.ranged.damage);
    expect(bow.damage).toBeGreaterThanOrEqual(barbarian.combat.ranged.damage);
  });

  it('ciągły ostrzał w jeden cel ustępuje ciosowi barbarzyńcy (krok 97: barbarzyńca walczy wręcz)', () => {
    const every = bow.strongEvery;
    const perSeries = bow.damage * (every - 1) + bow.strongDamage;
    const archerDps = perSeries / ((every * bow.intervalMs) / 1000);
    const barbarianDps = barbarian.combat.meleeDamage / (barbarian.combat.attackCooldownMs / 1000);
    expect(archerDps).toBeLessThan(barbarianDps);
  });
});

describe('łuk: strzała', () => {
  it('mocna jest silniejsza, szybsza i przebija; zwykła nie przebija', () => {
    const normal = arrowSpec(bow, false);
    const strong = arrowSpec(bow, true);
    expect(normal).toEqual({ damage: bow.damage, knockback: bow.knockback, speed: bow.speed, pierce: 0, strong: false });
    expect(strong.damage).toBeGreaterThan(normal.damage);
    expect(strong.knockback).toBeGreaterThan(normal.knockback);
    expect(strong.speed).toBeGreaterThan(normal.speed);
    expect(strong.pierce).toBe(bow.strongPierce);
  });
});

describe('łuk: ciągły ostrzał (BowRepeater, krok 97)', () => {
  const fire = (repeater: BowRepeater, times: number[]) => times.map((t) => repeater.update(true, t).fired);

  it('przytrzymanie strzela od razu, potem co intervalMs', () => {
    const repeater = new BowRepeater(bow);
    expect(repeater.update(true, 1000).fired).not.toBeNull();
    expect(repeater.update(true, 1000 + bow.intervalMs - 1).fired).toBeNull();
    expect(repeater.update(true, 1000 + bow.intervalMs).fired).not.toBeNull();
    expect(repeater.update(true, 1000 + bow.intervalMs).firing).toBe(true);
  });

  it('co strongEvery-ta strzała serii jest mocna; celownik zapowiada mocną', () => {
    const repeater = new BowRepeater({ ...bow, strongEvery: 3, intervalMs: 100 });
    expect(fire(repeater, [0, 100, 200, 300, 400, 500]).map((f) => f?.strong)).toEqual([false, false, true, false, false, true]);
    expect(new BowRepeater({ ...bow, strongEvery: 3 }).update(true, 0).nextStrong).toBe(false);
    const ready = new BowRepeater({ ...bow, strongEvery: 3, intervalMs: 100 });
    fire(ready, [0]);
    expect(ready.update(true, 100).nextStrong).toBe(true);
  });

  it('puszczenie i przerwanie zaczynają serię od nowa, ale nie skracają odstępu', () => {
    const repeater = new BowRepeater({ ...bow, strongEvery: 3, intervalMs: 100 });
    fire(repeater, [0, 100]);
    expect(repeater.update(false, 150)).toEqual({ firing: false, fired: null, nextStrong: false });
    expect(repeater.update(true, 199).fired).toBeNull();
    expect(fire(repeater, [200, 300, 400]).map((f) => f?.strong)).toEqual([false, false, true]);
    repeater.interrupt();
    expect(fire(repeater, [500, 600, 700]).map((f) => f?.strong)).toEqual([false, false, true]);
  });

  it('strongEvery 0 — żadna strzała nie jest mocna', () => {
    const repeater = new BowRepeater({ ...bow, strongEvery: 0, intervalMs: 100 });
    expect(fire(repeater, [0, 100, 200, 300]).every((f) => f?.strong === false)).toBe(true);
  });
});

describe('salwa', () => {
  it('wachlarz: środkowa strzała dokładnie w cel, skrajne o połowę rozpiętości obok', () => {
    const dirs = volleyDirections(0, 3, 30);
    expect(dirs).toHaveLength(3);
    expect(dirs[1]!.x).toBeCloseTo(1);
    expect(dirs[1]!.y).toBeCloseTo(0);
    expect(Math.atan2(dirs[0]!.y, dirs[0]!.x)).toBeCloseTo(-Math.PI / 12);
    expect(Math.atan2(dirs[2]!.y, dirs[2]!.x)).toBeCloseTo(Math.PI / 12);
  });

  it('jedna strzała leci prosto w cel', () => {
    expect(volleyDirections(Math.PI / 2, 1, 30)[0]!.y).toBeCloseTo(1);
  });
});

describe('przedmioty u łucznika', () => {
  it('Ostrze dodaje obrażenia obu strzał, Rękawice skracają odstęp, Kołczan dokłada ładunek salwy', () => {
    const geared = loadout([ItemId.Blade, ItemId.Gloves, ItemId.Quiver]);
    const gearedBow = archeryOf(geared.kit)!.bow;
    expect(gearedBow.damage).toBeGreaterThan(bow.damage);
    expect(gearedBow.strongDamage).toBeGreaterThan(bow.strongDamage);
    expect(gearedBow.intervalMs).toBeLessThan(bow.intervalMs);
    expect(geared.combat.ranged.maxCharges).toBe(archer.combat.ranged.maxCharges + 1);
  });

  it('Rękawice nie skrócą odstępu poniżej limitu odnowień', () => {
    const gloves = Array.from({ length: 20 }, () => ItemId.Gloves);
    expect(archeryOf(loadout(gloves).kit)!.bow.intervalMs).toBe(Math.round(bow.intervalMs * STAT_LIMITS.minCooldownMultiplier));
  });

  it('modyfikator piętra wydłuża odnawianie salwy (ładunki strzału)', () => {
    const effects = { playerRechargeMultiplier: 2 } as FloorModifierEffects;
    expect(applyFloorToLoadout(loadout(), effects).combat.ranged.rechargeMs).toBe(archer.combat.ranged.rechargeMs * 2);
  });
});
