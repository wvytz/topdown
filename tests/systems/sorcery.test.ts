import { describe, expect, it } from 'vitest';
import type { Hit } from '@/core/combatTypes';
import { HeroId } from '@/core/heroTypes';
import { ItemId } from '@/core/lootTypes';
import type { Vector2 } from '@/core/types';
import { HERO_DEFINITIONS, heroFromParam } from '@/config/heroConfig';
import { ITEM_DEFINITIONS, ITEM_EFFECTS, STAT_LIMITS } from '@/config/lootConfig';
import { applyFloorToLoadout } from '@/systems/FloorModifiers';
import type { FloorModifierEffects } from '@/core/floorModifierTypes';
import { Health } from '@/systems/Health';
import type { MeleeTarget } from '@/systems/MeleeResolver';
import { computeHeroLoadout } from '@/systems/PlayerLoadout';
import { NEW_RUN, RunState, newRun } from '@/systems/RunState';
import { BeamChannel, beamReach, crystalPoint, distanceToSegment, orbitOffsets, resolveBeam } from '@/systems/Sorcery';

const sorceress = HERO_DEFINITIONS[HeroId.Sorceress];
const barbarian = HERO_DEFINITIONS[HeroId.Barbarian];
const beamConfig = sorceress.sorcery!.beam;
const loadout = (items: ItemId[] = []) => computeHeroLoadout(sorceress, items, ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS);

const makeTarget = (x: number, y: number, hp = 100, radius = 10) => {
  const health = new Health(hp);
  const hits: Hit[] = [];
  const target: MeleeTarget & { hits: Hit[] } = {
    x,
    y,
    radius,
    hits,
    takeHit: (hit: Hit, _now: number, _source: Vector2) => {
      hits.push(hit);
      return health.takeDamage(hit.damage);
    },
  };
  return target;
};

describe('bohaterowie', () => {
  it('Czarodziejka ma mniej HP i wolniejszy chód niż barbarzyńca (decyzja właściciela)', () => {
    expect(sorceress.stats.maxHp).toBeLessThan(barbarian.stats.maxHp);
    expect(sorceress.stats.moveSpeed).toBeLessThan(barbarian.stats.moveSpeed);
    expect(barbarian.sorcery).toBeNull();
  });

  it('bohater przechodzi między piętrami w RunSnapshot; nowy run domyślnie barbarzyńcą', () => {
    expect(new RunState(NEW_RUN).hero).toBe(HeroId.Barbarian);
    const run = new RunState(newRun(HeroId.Sorceress));
    expect(new RunState(run.snapshot(40)).hero).toBe(HeroId.Sorceress);
  });

  it('loadout barbarzyńcy nie ma zestawu Czarodziejki', () => {
    expect(computeHeroLoadout(barbarian, [], ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS).sorcery).toBeNull();
  });
});

describe('przedmioty u Czarodziejki', () => {
  const base = sorceress.sorcery!.orbs;

  it('Ostrze dodaje obrażenia kul, Rękawice przyspieszają rzut, Kołczan dokłada kulę', () => {
    const orbs = loadout([ItemId.Blade, ItemId.Gloves, ItemId.Quiver]).sorcery!.orbs;
    expect(orbs.damage).toBeGreaterThan(base.damage);
    expect(orbs.castCooldownMs).toBeLessThan(base.castCooldownMs);
    expect(orbs.castWindupMs).toBeLessThan(base.castWindupMs);
    expect(orbs.maxOrbs).toBe(base.maxOrbs + 1);
  });

  it('liczba kul ma ten sam limit co ładunki strzału', () => {
    const quivers = Array.from({ length: 20 }, () => ItemId.Quiver);
    expect(loadout(quivers).sorcery!.orbs.maxOrbs).toBe(STAT_LIMITS.maxRangedCharges);
  });

  it('modyfikator piętra wydłuża odnawianie kul i blokadę promienia', () => {
    const effects = { playerRechargeMultiplier: 2 } as FloorModifierEffects;
    const slowed = applyFloorToLoadout(loadout(), effects).sorcery!;
    expect(slowed.orbs.rechargeMs).toBe(base.rechargeMs * 2);
    expect(slowed.beam.lockoutMs).toBe(beamConfig.lockoutMs * 2);
  });
});

describe('orbita kul', () => {
  it('kule są równo rozłożone na okręgu o zadanym promieniu', () => {
    const offsets = orbitOffsets(3, 0, 18, 1800);
    expect(offsets).toHaveLength(3);
    for (const o of offsets) expect(Math.hypot(o.x, o.y)).toBeCloseTo(18);
    const angle = (o: Vector2) => Math.atan2(o.y, o.x);
    const gap = (((angle(offsets[1]!) - angle(offsets[0]!)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    expect(gap).toBeCloseTo((2 * Math.PI) / 3);
  });

  it('orbita obraca się w czasie i wraca po pełnym okresie', () => {
    const a = orbitOffsets(1, 0, 18, 1800)[0]!;
    const b = orbitOffsets(1, 450, 18, 1800)[0]!;
    const c = orbitOffsets(1, 1800, 18, 1800)[0]!;
    expect(b.x).toBeCloseTo(0);
    expect(b.y).toBeCloseTo(18);
    expect(c.x).toBeCloseTo(a.x);
    expect(orbitOffsets(0, 0, 18, 1800)).toEqual([]);
  });
});

describe('promień (PPM)', () => {
  it('zapala się po wciśnięciu, zadaje obrażenia od razu i co tickMs', () => {
    const beam = new BeamChannel(beamConfig);
    expect(beam.update(true, 1000)).toEqual({ active: true, ticks: 1 });
    expect(beam.update(true, 1000 + beamConfig.tickMs - 1).ticks).toBe(0);
    expect(beam.update(true, 1000 + beamConfig.tickMs).ticks).toBe(1);
    expect(beam.update(true, 1000 + beamConfig.tickMs * 3).ticks).toBe(2);
  });

  it('puszczenie gasi promień i blokuje go na lockoutMs', () => {
    const beam = new BeamChannel(beamConfig);
    beam.update(true, 0);
    expect(beam.update(false, 500).active).toBe(false);
    expect(beam.update(true, 500 + beamConfig.lockoutMs - 1).active).toBe(false);
    expect(beam.readiness(500 + beamConfig.lockoutMs / 2)).toBeCloseTo(0.5);
    expect(beam.update(true, 500 + beamConfig.lockoutMs).active).toBe(true);
  });

  it('gaśnie sam po maxChannelMs i też wchodzi blokada', () => {
    const beam = new BeamChannel(beamConfig);
    beam.update(true, 0);
    expect(beam.update(true, beamConfig.maxChannelMs).active).toBe(false);
    expect(beam.update(true, beamConfig.maxChannelMs + beamConfig.lockoutMs - 1).active).toBe(false);
  });

  it('przerwanie (dash) działa jak puszczenie', () => {
    const beam = new BeamChannel(beamConfig);
    beam.update(true, 0);
    beam.interrupt(100);
    expect(beam.isActive()).toBe(false);
    expect(beam.update(true, 200).active).toBe(false);
    expect(beam.readiness(100 + beamConfig.lockoutMs)).toBe(1);
  });

  it('spowalnia Czarodziejkę (mnożnik ruchu < 1)', () => {
    expect(beamConfig.moveSpeedMultiplier).toBeGreaterThan(0);
    expect(beamConfig.moveSpeedMultiplier).toBeLessThan(1);
  });

  it('zatrzymuje się na ścianie', () => {
    const wallAt = 60;
    expect(beamReach({ x: 0, y: 0 }, 0, 150, (p) => p.x >= wallAt)).toBeLessThan(wallAt);
    expect(beamReach({ x: 0, y: 0 }, 0, 150, (p) => p.x >= wallAt)).toBeGreaterThan(wallAt - 8);
    expect(beamReach({ x: 0, y: 0 }, 0, 150, () => false)).toBe(150);
  });

  it('rani cele dotykające odcinka, pomija te obok i za końcem', () => {
    expect(distanceToSegment({ x: 50, y: 5 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(5);
    const inLine = makeTarget(80, 6);
    const aside = makeTarget(80, 30);
    const beyond = makeTarget(130, 0);
    const result = resolveBeam(
      { from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, halfWidth: 4, damage: 5, knockback: 25, now: 0, source: { x: 0, y: 0 } },
      [inLine, aside, beyond],
    );
    expect(result.hit).toEqual([inLine]);
    expect(inLine.hits[0]!.damage).toBe(5);
    expect(inLine.hits[0]!.knockback.x).toBeGreaterThan(0);
  });

  it('zwraca zabite cele', () => {
    const weak = makeTarget(20, 0, 3);
    const result = resolveBeam(
      { from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, halfWidth: 4, damage: 5, knockback: 0, now: 0, source: { x: 0, y: 0 } },
      [weak],
    );
    expect(result.killed).toEqual([weak]);
  });
});

describe('wybór bohatera z adresu', () => {
  it('?hero=sorceress wybiera Czarodziejkę, brak lub nieznana wartość — barbarzyńcę', () => {
    expect(heroFromParam('sorceress')).toBe(HeroId.Sorceress);
    expect(heroFromParam(null)).toBe(HeroId.Barbarian);
    expect(heroFromParam('mag')).toBe(HeroId.Barbarian);
  });
});

describe('punkt kryształu', () => {
  it('przed postacią i w prawo od osi patrzenia (kostur po prawej)', () => {
    const north = crystalPoint({ x: 0, y: 0 }, -Math.PI / 2, 17, 4);
    expect(north.x).toBeCloseTo(4);
    expect(north.y).toBeCloseTo(-17);
    const east = crystalPoint({ x: 0, y: 0 }, 0, 17, 4);
    expect(east.x).toBeCloseTo(17);
    expect(east.y).toBeCloseTo(4);
  });
});
