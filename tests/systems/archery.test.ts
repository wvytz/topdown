import { describe, expect, it } from 'vitest';
import type { FloorModifierEffects } from '@/core/floorModifierTypes';
import { HeroId, archeryOf } from '@/core/heroTypes';
import { ItemId } from '@/core/lootTypes';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { ITEM_DEFINITIONS, ITEM_EFFECTS, STAT_LIMITS } from '@/config/lootConfig';
import { BowDraw, arrowSpec, volleyDirections } from '@/systems/Archery';
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

  it('pełne naciągnięcie zadaje więcej niż strzał barbarzyńcy i kula Czarodziejki', () => {
    expect(arrowSpec(bow, 1).damage).toBeGreaterThan(barbarian.combat.ranged.damage);
    expect(bow.maxDamage).toBeGreaterThan(bow.minDamage);
  });
});

describe('łuk: siła strzały', () => {
  it('rośnie liniowo od kliknięcia do pełnego naciągnięcia', () => {
    const tap = arrowSpec(bow, 0);
    const half = arrowSpec(bow, 0.5);
    const full = arrowSpec(bow, 1);
    expect(tap.damage).toBe(bow.minDamage);
    expect(full.damage).toBe(bow.maxDamage);
    expect(half.damage).toBe(Math.round((bow.minDamage + bow.maxDamage) / 2));
    expect(tap.speed).toBeLessThan(full.speed);
    expect(tap.knockback).toBeLessThan(full.knockback);
  });

  it('przebicie i „pełna” strzała tylko przy pełnym naciągnięciu; siła poza 0..1 jest przycinana', () => {
    expect(arrowSpec(bow, 0.99).pierce).toBe(0);
    expect(arrowSpec(bow, 0.99).full).toBe(false);
    expect(arrowSpec(bow, 1).pierce).toBe(bow.fullDrawPierce);
    expect(arrowSpec(bow, 3)).toEqual(arrowSpec(bow, 1));
    expect(arrowSpec(bow, -1)).toEqual(arrowSpec(bow, 0));
  });
});

describe('łuk: naciąganie (BowDraw)', () => {
  it('przytrzymanie naciąga, puszczenie wypuszcza strzałę z bieżącą siłą', () => {
    const draw = new BowDraw(bow);
    expect(draw.update(true, 1000)).toEqual({ drawing: true, power: 0, released: null });
    expect(draw.update(true, 1000 + bow.drawMs / 2).power).toBeCloseTo(0.5);
    const tick = draw.update(false, 1000 + bow.drawMs / 2);
    expect(tick.released).toBeCloseTo(0.5);
    expect(tick.drawing).toBe(false);
  });

  it('siła nie przekracza 1 przy dłuższym trzymaniu', () => {
    const draw = new BowDraw(bow);
    draw.update(true, 0);
    expect(draw.update(true, bow.drawMs * 5).power).toBe(1);
    expect(draw.update(false, bow.drawMs * 5).released).toBe(1);
  });

  it('po strzale przerwa: trzymanie nie naciąga, dopóki trwa; potem naciąga od razu', () => {
    const draw = new BowDraw(bow);
    draw.update(true, 0);
    draw.update(false, 100);
    expect(draw.update(true, 100 + bow.cooldownMs - 1).drawing).toBe(false);
    expect(draw.update(true, 100 + bow.cooldownMs).drawing).toBe(true);
  });

  it('przerwanie (dash, paraliż) zwalnia cięciwę bez strzału i bez przerwy', () => {
    const draw = new BowDraw(bow);
    draw.update(true, 0);
    draw.interrupt();
    expect(draw.isDrawing).toBe(false);
    expect(draw.update(false, 300).released).toBeNull();
    expect(draw.update(true, 300).drawing).toBe(true);
  });

  it('bez trzymania nic się nie dzieje', () => {
    const draw = new BowDraw(bow);
    expect(draw.update(false, 0)).toEqual({ drawing: false, power: 0, released: null });
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
  it('Ostrze dodaje obrażenia łuku, Rękawice skracają naciąganie i przerwę, Kołczan dokłada ładunek salwy', () => {
    const geared = loadout([ItemId.Blade, ItemId.Gloves, ItemId.Quiver]);
    const gearedBow = archeryOf(geared.kit)!.bow;
    expect(gearedBow.minDamage).toBeGreaterThan(bow.minDamage);
    expect(gearedBow.maxDamage).toBeGreaterThan(bow.maxDamage);
    expect(gearedBow.drawMs).toBeLessThan(bow.drawMs);
    expect(gearedBow.cooldownMs).toBeLessThan(bow.cooldownMs);
    expect(geared.combat.ranged.maxCharges).toBe(archer.combat.ranged.maxCharges + 1);
  });

  it('Rękawice nie skrócą naciągania poniżej limitu odnowień', () => {
    const gloves = Array.from({ length: 20 }, () => ItemId.Gloves);
    expect(archeryOf(loadout(gloves).kit)!.bow.drawMs).toBe(Math.round(bow.drawMs * STAT_LIMITS.minCooldownMultiplier));
  });

  it('modyfikator piętra wydłuża odnawianie salwy (ładunki strzału)', () => {
    const effects = { playerRechargeMultiplier: 2 } as FloorModifierEffects;
    expect(applyFloorToLoadout(loadout(), effects).combat.ranged.rechargeMs).toBe(archer.combat.ranged.rechargeMs * 2);
  });
});
