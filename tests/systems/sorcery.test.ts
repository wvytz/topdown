import { describe, expect, it } from 'vitest';
import type { Hit } from '@/core/combatTypes';
import { HeroId, sorceryOf } from '@/core/heroTypes';
import { ItemId } from '@/core/lootTypes';
import type { Vector2 } from '@/core/types';
import { HERO_DEFINITIONS } from '@/config/heroConfig';
import { ITEM_DEFINITIONS, ITEM_EFFECTS, STAT_LIMITS } from '@/config/lootConfig';
import { applyFloorToLoadout } from '@/systems/FloorModifiers';
import type { FloorModifierEffects } from '@/core/floorModifierTypes';
import { Health } from '@/systems/Health';
import type { MeleeTarget } from '@/systems/MeleeResolver';
import { computeHeroLoadout } from '@/systems/PlayerLoadout';
import { NEW_RUN, RunState, newRun } from '@/systems/RunState';
import { BeamChannel, OrbSeries, beamReach, crystalPoint, distanceToSegment, orbitOffsets, resolveBeam, resolveSplash } from '@/systems/Sorcery';

const sorceress = HERO_DEFINITIONS[HeroId.Sorceress];
const barbarian = HERO_DEFINITIONS[HeroId.Barbarian];
const beamConfig = sorceryOf(sorceress.kit)!.beam;
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
    expect(sorceryOf(barbarian.kit)).toBeNull();
  });

  it('bohater przechodzi między piętrami w RunSnapshot; nowy run domyślnie barbarzyńcą', () => {
    expect(new RunState(NEW_RUN).hero).toBe(HeroId.Barbarian);
    const run = new RunState(newRun(HeroId.Sorceress));
    expect(new RunState(run.snapshot(40)).hero).toBe(HeroId.Sorceress);
  });

  it('loadout barbarzyńcy nie ma zestawu Czarodziejki', () => {
    expect(computeHeroLoadout(barbarian, [], ITEM_DEFINITIONS, STAT_LIMITS, ITEM_EFFECTS).kit.kind).toBe('melee');
  });
});

describe('przedmioty u Czarodziejki', () => {
  const base = sorceryOf(sorceress.kit)!.orbs;

  it('Ostrze dodaje obrażenia kul i fali, Rękawice przyspieszają rzut i powrót serii, Kołczan dokłada kulę', () => {
    const orbs = sorceryOf(loadout([ItemId.Blade, ItemId.Gloves, ItemId.Quiver]).kit)!.orbs;
    expect(orbs.damage).toBeGreaterThan(base.damage);
    expect(orbs.nova.damage).toBeGreaterThan(base.nova.damage);
    expect(orbs.reloadMs).toBeLessThan(base.reloadMs);
    expect(orbs.castCooldownMs).toBeLessThan(base.castCooldownMs);
    expect(orbs.castWindupMs).toBeLessThan(base.castWindupMs);
    expect(orbs.maxOrbs).toBe(base.maxOrbs + 1);
  });

  it('liczba kul ma ten sam limit co ładunki strzału', () => {
    const quivers = Array.from({ length: 20 }, () => ItemId.Quiver);
    expect(sorceryOf(loadout(quivers).kit)!.orbs.maxOrbs).toBe(STAT_LIMITS.maxRangedCharges);
  });

  it('modyfikator piętra wydłuża odnawianie kul i blokadę promienia', () => {
    const effects = { playerRechargeMultiplier: 2 } as FloorModifierEffects;
    const slowed = sorceryOf(applyFloorToLoadout(loadout(), effects).kit)!;
    expect(slowed.orbs.rechargeMs).toBe(base.rechargeMs * 2);
    expect(slowed.orbs.reloadMs).toBe(base.reloadMs * 2);
    expect(slowed.beam.lockoutMs).toBe(beamConfig.lockoutMs * 2);
  });
});

describe('seria kul (OrbSeries, krok 97)', () => {
  it('ostatnia kula serii wyzwala falę, potem wszystkie wracają naraz po reloadMs', () => {
    const series = new OrbSeries(3, 900, 600);
    expect(series.tryThrow(0)).toEqual({ last: false });
    expect(series.tryThrow(300)).toEqual({ last: false });
    expect(series.tryThrow(600)).toEqual({ last: true });
    expect(series.tryThrow(700)).toBeNull();
    expect(series.available(1199)).toBe(0);
    expect(series.rechargeProgress(900)).toBeCloseTo(0.5);
    expect(series.available(1200)).toBe(3);
    expect(series.rechargeProgress(1200)).toBe(1);
  });

  it('seria przerwana w połowie odnawia się po jednej kuli co rechargeMs', () => {
    const series = new OrbSeries(3, 900, 600);
    series.tryThrow(0);
    series.tryThrow(100);
    expect(series.available(899)).toBe(1);
    expect(series.available(900)).toBe(2);
    expect(series.available(1800)).toBe(3);
  });

  it('Kołczan w trakcie powrotu daje kulę od razu; nowe czasy działają od kolejnej serii', () => {
    const series = new OrbSeries(1, 900, 600);
    expect(series.tryThrow(0)).toEqual({ last: true });
    series.resize(2, 100);
    expect(series.available(100)).toBe(1);
    series.setTiming(900, 200);
    series.tryThrow(100);
    expect(series.available(299)).toBe(0);
    expect(series.available(300)).toBe(2);
  });

  it('przytrzymany LPM nie traci rytmu: seria z falą trwa krócej niż dawne odnawianie trzech kul', () => {
    const { orbs } = sorceryOf(sorceress.kit)!;
    const cycle = orbs.castWindupMs + (orbs.maxOrbs - 1) * orbs.castCooldownMs + orbs.reloadMs;
    expect(cycle).toBeLessThan(orbs.maxOrbs * 1500);
  });
});

describe('fala uderzeniowa (krok 97)', () => {
  it('rani i odpycha od Czarodziejki wszystkich w promieniu, magią', () => {
    const { nova } = sorceryOf(sorceress.kit)!.orbs;
    const near = makeTarget(nova.radius, 0, 100, 8);
    const behind = makeTarget(-20, 0, 100, 8);
    const far = makeTarget(nova.radius + 20, 0, 100, 8);
    const center = { x: 0, y: 0 };
    resolveSplash({ center, radius: nova.radius, damage: nova.damage, knockback: nova.knockback, now: 0, source: center, exclude: null }, [near, behind, far]);
    expect(near.hits[0]).toMatchObject({ damage: nova.damage, magic: true, knockback: { x: nova.knockback, y: 0 } });
    expect(behind.hits[0]!.knockback.x).toBeCloseTo(-nova.knockback);
    expect(far.hits).toHaveLength(0);
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

describe('magia Czarodziejki (krok 49b)', () => {
  it('promień niesie znacznik magii — trafia też bezcielesnych', async () => {
    const { resolveBeam } = await import('@/systems/Sorcery');
    const seen: Array<{ magic?: boolean }> = [];
    const target = { x: 50, y: 0, radius: 8, takeHit: (hit: { magic?: boolean }) => (seen.push(hit), { dealt: 1, died: false }) };
    resolveBeam({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, halfWidth: 4, damage: 5, knockback: 0, now: 0, source: { x: 0, y: 0 } }, [target]);
    expect(seen[0]?.magic).toBe(true);
  });

  it('kula z magią przekazuje znacznik do trafienia, zwykły strzał nie', async () => {
    const { resolvePlayerShot } = await import('@/systems/ShotResolver');
    const hits: Array<{ magic?: boolean }> = [];
    const target = { x: 10, y: 0, radius: 8, takeHit: (hit: { magic?: boolean }) => (hits.push(hit), { dealt: 1, died: false }) };
    const shot = { position: { x: 8, y: 0 }, velocity: { x: 100, y: 0 }, radius: 4, origin: { x: 0, y: 0 }, damage: 5, knockback: 0, now: 0 };
    resolvePlayerShot({ ...shot, magic: true }, [target]);
    resolvePlayerShot(shot, [target]);
    expect(hits[0]?.magic).toBe(true);
    expect(hits[1]?.magic).toBeUndefined();
  });
});

describe('rozprysk kuli (krok 50)', () => {
  it('rani sąsiadów głównego celu ułamkiem obrażeń, magią i bez statusów; główny cel pomija', async () => {
    const { resolveSplash, splashDamage } = await import('@/systems/Sorcery');
    const { HERO_DEFINITIONS } = await import('@/config/heroConfig');
    const splash = sorceryOf(HERO_DEFINITIONS.sorceress.kit)!.orbs.splash;
    const hits: Array<{ who: string; damage: number; magic?: boolean; status?: unknown }> = [];
    const mk = (who: string, x: number) => ({ x, y: 0, radius: 8, takeHit: (h: { damage: number; magic?: boolean; status?: unknown }) => (hits.push({ who, ...h }), { dealt: h.damage, died: false }) });
    const main = mk('main', 0);
    const near = mk('near', splash.radius + 4);
    const far = mk('far', splash.radius + 40);
    const damage = splashDamage(14, splash.damageFraction);
    resolveSplash({ center: { x: 0, y: 0 }, radius: splash.radius, damage, now: 0, source: { x: -50, y: 0 }, exclude: main }, [main, near, far]);
    expect(hits.map((h) => h.who)).toEqual(['near']);
    expect(hits[0]!.damage).toBe(Math.round(14 * splash.damageFraction));
    expect(hits[0]!.magic).toBe(true);
    expect(hits[0]!.status).toBeUndefined();
    expect(damage).toBeLessThan(14);
    expect(splashDamage(1, 0.35)).toBe(1);
  });
});
