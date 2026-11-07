import { describe, expect, it } from 'vitest';
import { ItemId, ItemKind } from '@/core/lootTypes';
import { ITEM_DEFINITIONS, ITEM_EFFECTS, ITEM_POOL, STAT_LIMITS } from '@/config/lootConfig';
import { RELIC_CONFIG } from '@/config/relicConfig';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { HeroId } from '@/core/heroTypes';
import { JellyGuard, computeRelicEffects, executeDamage, relicForFloor, withRelicCard, withRelicStatus } from '@/systems/Relics';
import { computeHeroLoadout } from '@/systems/PlayerLoadout';
import { describeRewardCard } from '@/systems/ItemEvolution';

const RELICS = Object.values(RELIC_CONFIG.byFloorInLoop);

describe('relikwie bossów (krok 170)', () => {
  it('7 relikwii, po jednej na bossa kręgu, wszystkie rodzaju Relic', () => {
    expect(new Set(RELICS).size).toBe(7);
    for (let floor = 1; floor <= 7; floor++) expect(relicForFloor(floor, 7, RELIC_CONFIG)).toBe(RELIC_CONFIG.byFloorInLoop[floor]);
    for (const id of RELICS) expect(ITEM_DEFINITIONS[id].kind).toBe(ItemKind.Relic);
  });

  it('kolejny krąg i arena N dają relikwię bossa tego samego piętra kręgu', () => {
    expect(relicForFloor(8, 7, RELIC_CONFIG)).toBe(ItemId.SlimeCrown);
    expect(relicForFloor(14, 7, RELIC_CONFIG)).toBe(ItemId.StorkFeather);
  });

  it('relikwie nie trafiają do puli łupów, kart ani kapliczki', () => {
    for (const item of ITEM_POOL) expect(item.kind).not.toBe(ItemKind.Relic);
    expect(ITEM_POOL).toHaveLength(12);
  });

  it('relikwia zastępuje ostatnią kartę, która nie jest kartą rozwoju', () => {
    const choices = [ItemId.Blade, ItemId.Heart, ItemId.Boots];
    expect(withRelicCard(choices, ItemId.HeadsmanAxe, [], null)).toEqual([ItemId.Blade, ItemId.Heart, ItemId.HeadsmanAxe]);
    expect(withRelicCard(choices, ItemId.HeadsmanAxe, [ItemId.Boots], ItemId.Boots)).toEqual([ItemId.Blade, ItemId.HeadsmanAxe, ItemId.Boots]);
  });

  it('bohater z relikwią dostaje zwykłe karty; pusta lista — sama relikwia', () => {
    const choices = [ItemId.Blade, ItemId.Heart, ItemId.Boots];
    expect(withRelicCard(choices, ItemId.SlimeCrown, [ItemId.SlimeCrown], null)).toEqual(choices);
    expect(withRelicCard([], ItemId.SlimeCrown, [], null)).toEqual([ItemId.SlimeCrown]);
    expect(withRelicCard(choices, null, [], null)).toEqual(choices);
  });

  it('Korona Szlamu: co 8 s jedno trafienie o połowę słabsze', () => {
    const guard = new JellyGuard();
    const jelly = computeRelicEffects([ItemId.SlimeCrown], RELIC_CONFIG).jelly;
    expect(guard.absorb(20, 0, jelly)).toEqual({ damage: 10, absorbed: true });
    expect(guard.absorb(20, 1000, jelly)).toEqual({ damage: 20, absorbed: false });
    expect(guard.absorb(20, 8000, jelly).absorbed).toBe(true);
    expect(new JellyGuard().absorb(20, 0, null)).toEqual({ damage: 20, absorbed: false });
  });

  it('Topór Kata dobija poniżej 20% HP, wyżej nie zmienia obrażeń', () => {
    expect(executeDamage(30, 100, 15, 0.2)).toBe(30);
    expect(executeDamage(50, 100, 15, 0.2)).toBe(15);
    expect(executeDamage(30, 100, 15, 0)).toBe(15);
  });

  it('Pajęczy jedwab spowalnia; z Lodowym odłamkiem bierze silniejsze i zostawia zamrożenie', () => {
    expect(withRelicStatus({}, [ItemId.SpiderSilk], RELIC_CONFIG).slow).toEqual({ pct: 0.3, durationMs: 2000 });
    const frost = { pct: 0.5, durationMs: 1500, freeze: { durationMs: 1, shatterRadius: 1, shatterSlow: { pct: 0.1, durationMs: 1 } } };
    const merged = withRelicStatus({ slow: frost }, [ItemId.SpiderSilk], RELIC_CONFIG).slow;
    expect(merged?.pct).toBe(0.5);
    expect(merged?.durationMs).toBe(2000);
    expect(merged?.freeze).toBeDefined();
    expect(withRelicStatus({}, [ItemId.HeadsmanAxe], RELIC_CONFIG).execute).toEqual({ belowPct: 0.2 });
  });

  it('loadout: Mokry mop daje ładunek dasha (także z Pętlą czasu), Fajka i Ząb trafiają do efektów', () => {
    const hero = HERO_DEFINITIONS[HeroId.Barbarian];
    const mop = computeHeroLoadout(hero, [ItemId.WetMop], ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);
    expect(mop.combat.dash.charges).toBe(2);
    const loop = computeHeroLoadout(hero, [ItemId.WetMop, ItemId.Hourglass, ItemId.Hourglass, ItemId.Hourglass], ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);
    expect(loop.combat.dash.charges).toBe(3);
    const relics = computeHeroLoadout(hero, [ItemId.BaronPipe, ItemId.DevourerTooth], ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS).effects.relics;
    expect(relics.ultimatePassiveMultiplier).toBe(2);
    expect(relics.killHeal).toBe(3);
    const silk = computeHeroLoadout(hero, [ItemId.SpiderSilk], ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS).effects;
    expect(silk.meleeStatus.slow?.pct).toBe(0.3);
    expect(silk.shotStatus.slow?.pct).toBe(0.3);
  });

  it('karta relikwii: osobny rodzaj, bez kropek przemiany', () => {
    const info = describeRewardCard(ITEM_DEFINITIONS[ItemId.HeadsmanAxe], 0, ITEM_EFFECTS.evolution);
    expect(info.kind).toBe('relic');
    expect(info.pips.total).toBe(0);
  });
});
