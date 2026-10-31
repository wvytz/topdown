import { describe, expect, it } from 'vitest';
import { HeroId } from '@/core/heroTypes';
import { ItemId } from '@/core/lootTypes';
import { createRng } from '@/core/random';
import { ENEMY_STATUS_RESISTANCE, PLAYER_COMBAT } from '@/config/combatConfig';
import { BOSS_STATUS_RESISTANCE } from '@/config/bossConfig';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { ITEM_EVOLUTION } from '@/config/itemEvolutionConfig';
import { ITEM_DEFINITIONS, ITEM_EFFECTS, ITEM_POOL, STAT_LIMITS } from '@/config/lootConfig';
import { PRACTICE_LOADOUT_CONFIG } from '@/config/practiceLoadoutConfig';
import { AttackCycle } from '@/systems/AttackCycle';
import { AttackRamp } from '@/systems/AttackRamp';
import { chainTargets } from '@/systems/ChainLightning';
import { DashController } from '@/systems/DashController';
import {
  ALL_ITEM_IDS,
  capItemCopies,
  countItems,
  describeRewardCard,
  developmentCandidates,
  parseItemList,
  rollRewardChoices,
} from '@/systems/ItemEvolution';
import { computeHeroLoadout, computeLoadout } from '@/systems/PlayerLoadout';
import { simulatePracticeLoadout } from '@/systems/PracticeLoadout';
import { StatusEffects } from '@/systems/StatusEffects';
import { StormTrail } from '@/systems/StormTrail';
import { computeWeaponEffects } from '@/systems/WeaponEffects';

const many = (id: ItemId, n: number): ItemId[] => Array.from({ length: n }, () => id);
const fx = (items: ItemId[]) => computeWeaponEffects(items, ITEM_EFFECTS).evolved;
const loadout = (items: ItemId[]) => computeLoadout(PLAYER_BASE_STATS, PLAYER_COMBAT, items, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);

describe('przemiany przedmiotów (krok 150)', () => {
  it('każdy przedmiot ma przemianę z nazwą i opisem; przemiana przy 3. kopii', () => {
    expect(ITEM_EVOLUTION.copies).toBe(3);
    for (const id of ALL_ITEM_IDS) {
      const evo = ITEM_EVOLUTION.items[id];
      expect(evo.name.length).toBeGreaterThan(0);
      expect(evo.effect.length).toBeGreaterThan(0);
      // Przedmiot bez limitu musi mówić, co dają kopie po przemianie.
      if (evo.maxCopies === undefined) expect(evo.after).toBeDefined();
      else expect(evo.maxCopies).toBeGreaterThanOrEqual(ITEM_EVOLUTION.copies);
    }
  });

  it('dwie kopie nie przemieniają, trzecia tak', () => {
    expect(fx(many(ItemId.ElectricArrow, 2)).sparker).toBeNull();
    expect(fx(many(ItemId.ElectricArrow, 3)).sparker).not.toBeNull();
    expect(fx(many(ItemId.Blade, 2)).bladeWave).toBeNull();
    expect(fx(many(ItemId.Blade, 3)).bladeWave).not.toBeNull();
    expect(fx(many(ItemId.Boots, 2)).levitation).toBe(false);
    expect(fx(many(ItemId.Boots, 3)).levitation).toBe(true);
    expect(fx(many(ItemId.Gloves, 3)).attackRamp).not.toBeNull();
    expect(fx(many(ItemId.Hourglass, 3)).dashCharges).toBe(2);
    expect(fx(many(ItemId.Shuriken, 3)).ricochet).toBe(ITEM_EVOLUTION.ricochet.bounces);
    expect(fx(many(ItemId.Quiver, 3)).twinShot).toBe(true);
    expect(fx(many(ItemId.StormDash, 3)).stormTrail).not.toBeNull();
    expect(computeWeaponEffects(many(ItemId.VampireFang, 3), ITEM_EFFECTS, 100).evolved.bloodShieldMax).toBe(15);
    expect(computeWeaponEffects(many(ItemId.FireFist, 3), ITEM_EFFECTS).meleeStatus.burn?.pyre).toBeDefined();
    expect(computeWeaponEffects(many(ItemId.FireFist, 2), ITEM_EFFECTS).meleeStatus.burn?.pyre).toBeUndefined();
    expect(computeWeaponEffects(many(ItemId.FrostShard, 3), ITEM_EFFECTS).shotStatus.slow?.freeze).toBeDefined();
  });

  it('Elektryczna strzała: łańcuch od 1. kopii (1, potem 2 cele), Iskrownik przyspiesza do limitu', () => {
    expect(fx([ItemId.ElectricArrow]).chain?.targets).toBe(1);
    expect(fx(many(ItemId.ElectricArrow, 2)).chain?.targets).toBe(2);
    expect(fx(many(ItemId.ElectricArrow, 9)).chain?.targets).toBe(ITEM_EVOLUTION.chain.maxTargets);
    expect(fx(many(ItemId.ElectricArrow, 4)).sparker?.intervalMs).toBe(ITEM_EVOLUTION.sparker.intervalMs - ITEM_EVOLUTION.sparker.intervalStepMs);
    expect(fx(many(ItemId.ElectricArrow, 20)).sparker?.intervalMs).toBe(ITEM_EVOLUTION.sparker.minIntervalMs);
  });

  it('Napompowane serce: 3. kopia daje podwójne HP, kolejne znów zwykłe', () => {
    const hp = (n: number) => loadout(many(ItemId.Heart, n)).stats.maxHp;
    expect(hp(2) - hp(1)).toBe(20);
    expect(hp(3) - hp(2)).toBe(40);
    expect(hp(4) - hp(3)).toBe(20);
  });

  it('limity kopii: Buty, Rękawice, Klepsydra, Kołczan, Kieł i Odłamek kończą się na 3', () => {
    for (const id of [ItemId.Boots, ItemId.Gloves, ItemId.Hourglass, ItemId.Quiver, ItemId.VampireFang, ItemId.FrostShard]) {
      expect(capItemCopies(many(id, 7), ITEM_EVOLUTION)).toHaveLength(3);
      expect(JSON.stringify(loadout(many(id, 7)))).toBe(JSON.stringify(loadout(many(id, 3))));
    }
    expect(capItemCopies(many(ItemId.Blade, 7), ITEM_EVOLUTION)).toHaveLength(7);
    expect(loadout(many(ItemId.Boots, 9)).stats.moveSpeed).toBe(Math.round(PLAYER_BASE_STATS.moveSpeed * 1.3));
  });

  it('Pętla czasu: dash z 2 ładunkami; Kołczan bez dna skraca ładowanie strzału', () => {
    expect(loadout(many(ItemId.Hourglass, 3)).combat.dash.charges).toBe(2);
    expect(loadout(many(ItemId.Hourglass, 2)).combat.dash.charges).toBeUndefined();
    expect(loadout(many(ItemId.Quiver, 3)).combat.ranged.rechargeMs).toBe(Math.round(PLAYER_COMBAT.ranged.rechargeMs * ITEM_EVOLUTION.quiver.rechargeMultiplier));
    const archer = HERO_DEFINITIONS[HeroId.Archer];
    const kit = computeHeroLoadout(archer, many(ItemId.Quiver, 3), ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS).kit;
    expect(kit.kind === 'archery' && kit.archery.volley.arrows).toBe(3 + ITEM_EVOLUTION.quiver.extraVolleyArrows);
  });

  it('Rozpęd liczy się w tym samym limicie tempa ataku', () => {
    const base = loadout(many(ItemId.Gloves, 3)).combat.attackCooldownMs;
    const ramped = computeLoadout(PLAYER_BASE_STATS, PLAYER_COMBAT, many(ItemId.Gloves, 3), ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS, undefined, 0.24).combat.attackCooldownMs;
    expect(ramped).toBeLessThan(base);
    expect(ramped).toBe(Math.round(PLAYER_COMBAT.attackCooldownMs / (1 + STAT_LIMITS.maxAttackSpeedBonus)));
  });
});

describe('karta nagrody i karta rozwoju (krok 150)', () => {
  const blade = ITEM_DEFINITIONS[ItemId.Blade];

  it('karta mówi poziom i ile brakuje do przemiany', () => {
    const fresh = describeRewardCard(blade, 0, ITEM_EVOLUTION);
    expect(fresh.kind).toBe('new');
    expect(fresh.pips).toEqual({ filled: 1, total: 3 });
    expect(fresh.progress).toContain('Fala ostrza');
    const growth = describeRewardCard(blade, 1, ITEM_EVOLUTION);
    expect(growth.kind).toBe('growth');
    expect(growth.progress).toContain('jeszcze 1');
    const evolution = describeRewardCard(blade, 2, ITEM_EVOLUTION);
    expect(evolution.kind).toBe('evolution');
    expect(evolution.title).toBe('Fala ostrza');
    expect(evolution.effect).toBe(ITEM_EVOLUTION.items[ItemId.Blade].effect);
    const after = describeRewardCard(blade, 3, ITEM_EVOLUTION);
    expect(after.kind).toBe('evolved');
    expect(after.effect).toBe(ITEM_EVOLUTION.items[ItemId.Blade].after);
  });

  it('karta rozwoju: zawsze jedna karta przedmiotu w trakcie budowy', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const roll = rollRewardChoices(ITEM_POOL, 3, createRng(seed), [ItemId.FrostShard], ITEM_EVOLUTION);
      expect(roll.development).toBe(ItemId.FrostShard);
      expect(roll.choices).toContain(ItemId.FrostShard);
      expect(new Set(roll.choices).size).toBe(3);
    }
  });

  it('bez przedmiotów w budowie karty są zwykłe; przemienione nie są kandydatami', () => {
    expect(rollRewardChoices(ITEM_POOL, 3, createRng(5), [], ITEM_EVOLUTION).development).toBeNull();
    expect(developmentCandidates(ITEM_POOL, countItems(many(ItemId.Blade, 3)), ITEM_EVOLUTION)).toEqual([]);
  });

  it('?items= — lista przedmiotów z kopiami', () => {
    expect(parseItemList('electric-arrow*3,blade')).toEqual([...many(ItemId.ElectricArrow, 3), ItemId.Blade]);
    expect(parseItemList('0')).toBeNull();
    expect(parseItemList(null)).toBeNull();
    expect(parseItemList('nic*2')).toBeNull();
  });

  it('szybki start: gracz budujący przemianę ma ją zwykle do piętra 9', () => {
    let withEvolution = 0;
    const runs = 200;
    for (let seed = 1; seed <= runs; seed++) {
      const items = simulatePracticeLoadout(seed * 7919, 9, HERO_DEFINITIONS[HeroId.Barbarian], PRACTICE_LOADOUT_CONFIG).items;
      const counts = countItems(items);
      if ([...counts.values()].some((n) => n >= 3)) withEvolution++;
    }
    expect(withEvolution / runs).toBeGreaterThan(0.9);
  });
});

describe('mechaniki przemian (krok 150)', () => {
  it('Zamrożenie: trafienie spowolnionego wroga zamraża; zamrożony pęka przy śmierci', () => {
    const freeze = { durationMs: 1000, shatterRadius: 40, shatterSlow: { pct: 0.5, durationMs: 1500 } };
    const status = new StatusEffects(ENEMY_STATUS_RESISTANCE);
    status.apply({ slow: { pct: 0.4, durationMs: 1500, freeze } }, 0);
    expect(status.isFrozen(10)).toBe(false);
    status.apply({ slow: { pct: 0.4, durationMs: 1500, freeze } }, 100);
    expect(status.isFrozen(200)).toBe(true);
    expect(status.isStunned(200)).toBe(true);
    expect(status.deathEcho(200).shatter).toEqual(freeze);
    expect(status.deathEcho(1200).shatter).toBeNull();
  });

  it('Zamrożenie na bossie: krótko i z odpornością', () => {
    const freeze = { durationMs: 1000, shatterRadius: 40, shatterSlow: { pct: 0.5, durationMs: 1500 } };
    const status = new StatusEffects(BOSS_STATUS_RESISTANCE);
    status.apply({ slow: { pct: 0.4, durationMs: 1500, freeze } }, 0);
    status.apply({ slow: { pct: 0.4, durationMs: 1500, freeze } }, 100);
    expect(status.isFrozen(100 + 1000 * BOSS_STATUS_RESISTANCE.stunMultiplier - 1)).toBe(true);
    expect(status.isFrozen(100 + 1000 * BOSS_STATUS_RESISTANCE.stunMultiplier + 1)).toBe(false);
  });

  it('Pożoga: płonący wróg ma wybuch przy śmierci, wygasły — nie', () => {
    const status = new StatusEffects(ENEMY_STATUS_RESISTANCE);
    const burn = { tickDamage: 3, tickMs: 500, durationMs: 2000, pyre: { radius: 32, damage: 12 } };
    status.apply({ burn }, 0);
    expect(status.deathEcho(1000).pyre?.pyre).toEqual(burn.pyre);
    expect(status.deathEcho(2500).pyre).toBeNull();
  });

  it('dash z 2 ładunkami: dwa zrywy po sobie, potem odnowienie', () => {
    const dash = new DashController({ speed: 500, durationMs: 140, cooldownMs: 700, charges: 2 });
    expect(dash.tryStart(0, { x: 1, y: 0 })).toBe(true);
    expect(dash.tryStart(100, { x: 1, y: 0 })).toBe(false); // jeszcze trwa
    expect(dash.tryStart(150, { x: 1, y: 0 })).toBe(true);
    expect(dash.tryStart(300, { x: 1, y: 0 })).toBe(false);
    expect(dash.tryStart(701, { x: 1, y: 0 })).toBe(true);
  });

  it('nowa konfiguracja dasha i ciosu nie zeruje odnowienia (wcześniej szał dawał świeży dash)', () => {
    const dash = new DashController({ speed: 500, durationMs: 140, cooldownMs: 700 });
    dash.tryStart(0, { x: 1, y: 0 });
    const next = dash.reconfigured({ speed: 500, durationMs: 140, cooldownMs: 700 }, 200);
    expect(next.tryStart(300, { x: 1, y: 0 })).toBe(false);
    expect(next.tryStart(701, { x: 1, y: 0 })).toBe(true);
    const cycle = new AttackCycle(0, 320);
    cycle.tryStart(0);
    expect(cycle.withTiming(0, 200).tryStart(100)).toBe(false);
    expect(cycle.withTiming(0, 200).tryStart(201)).toBe(true);
  });

  it('Rozpęd: stopnie rosną przy ciągłym ataku, przerwa zeruje', () => {
    const effect = ITEM_EVOLUTION.attackRamp;
    const ramp = new AttackRamp();
    for (let t = 0; t <= 2000; t += 300) ramp.onAttack(t, effect);
    expect(ramp.step(2000, effect)).toBe(effect.steps);
    expect(ramp.bonus(2000, effect)).toBeCloseTo(effect.steps * effect.stepPct);
    expect(ramp.step(2000 + effect.resetAfterMs + 1, effect)).toBe(0);
    expect(ramp.step(0, null)).toBe(0);
  });

  it('łańcuch pioruna skacze od najbliższego, bez powtórek i w zasięgu', () => {
    const a = { x: 10, y: 0, radius: 5 };
    const b = { x: 30, y: 0, radius: 5 };
    const c = { x: 200, y: 0, radius: 5 };
    expect(chainTargets({ x: 0, y: 0 }, [c, b, a], 3, 60)).toEqual([a, b]);
    expect(chainTargets({ x: 0, y: 0 }, [a, b], 2, 60, (t) => t === a)).toEqual([b]);
  });

  it('Ślad burzy: punkty co `spacing` px w dashu, tyknięcie raz na `tickMs`, wygasają', () => {
    const effect = { durationMs: 1500, tickMs: 250, radius: 10, damage: 5, spacing: 10 };
    const trail = new StormTrail();
    trail.track({ x: 0, y: 0 }, true, 0, effect);
    trail.track({ x: 50, y: 0 }, true, 16, effect);
    trail.track({ x: 50, y: 0 }, false, 32, effect);
    expect(trail.alive.length).toBe(6);
    expect(trail.strike(32, effect)).toHaveLength(6);
    expect(trail.strike(100, effect)).toHaveLength(0);
    expect(trail.strike(300, effect)).toHaveLength(6);
    trail.track({ x: 50, y: 0 }, false, 1600, effect);
    expect(trail.alive).toHaveLength(0);
  });
});
