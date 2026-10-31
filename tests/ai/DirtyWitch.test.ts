import { describe, expect, it } from 'vitest';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import type { BossAttackPlan } from '@/core/bossTypes';
import { DIRTY_WITCH, bossForFloor, scaleBossForFloor } from '@/config/bossConfig';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { BOSS_VISUALS, SPRITE_SHEETS, spiderlingVisual } from '@/config/spriteConfig';
import type { AttackPlanContext } from '@/ai/bossAttacks';
import { planBossAttack } from '@/ai/bossAttacks';
import { BossBrain } from '@/ai/BossBrain';
import { createRng } from '@/core/random';
import { scaleForFloor } from '@/systems/CombatMath';

describe('Brudna Wiedźma (krok 137)', () => {
  const ctx = (kind: BossAttackKind, over: Partial<AttackPlanContext> = {}): AttackPlanContext => ({
    kind,
    definition: DIRTY_WITCH,
    self: { x: 0, y: 0 },
    target: { x: 200, y: 0 },
    now: 1000,
    enraged: false,
    rng: createRng(7),
    ...over,
  });

  it('zamyka krąg: piętro 8 (Bociani Ogród), krąg ma 8 pięter, w kolejnym kręgu znów na 16', () => {
    expect(TOWER_CONFIG.floorsPerLoop).toBe(8);
    expect(bossForFloor(8).id).toBe(BossId.DirtyWitch);
    expect(bossForFloor(16).id).toBe(BossId.DirtyWitch);
    expect(bossForFloor(7).id).toBe(BossId.CleanerDark);
  });

  describe('klucz bocianów', () => {
    const plan = planBossAttack(ctx(BossAttackKind.StorkFlight));
    const def = DIRTY_WITCH.storkFlight;

    it('bocian na każdy pas; pasy wzdłuż linii wiedźma → bohater, jeden przez bohatera', () => {
      expect(plan.throws).toHaveLength(def.lanes);
      for (const stork of plan.throws) {
        expect(stork.look).toBe('stork');
        expect(stork.to.y).toBeCloseTo(stork.from.y);
        expect(stork.to.x - stork.from.x).toBeCloseTo(def.length);
      }
      const nearest = Math.min(...plan.strikes.map((s) => Math.hypot(s.center.x - 200, s.center.y)));
      expect(nearest).toBeLessThanOrEqual(def.step / 2);
    });

    it('między pasami jest przejście szersze niż strefy', () => {
      const lanes = [...new Set(plan.strikes.map((s) => Math.round(s.center.y)))].sort((a, b) => a - b);
      expect(lanes).toHaveLength(def.lanes);
      for (let i = 1; i < lanes.length; i++) expect(lanes[i]! - lanes[i - 1]! - 2 * def.radius).toBeGreaterThanOrEqual(40);
    });

    it('telegraf od razu, uderzenia idą za bocianem — dalsze strefy później', () => {
      const lane = plan.strikes.filter((s) => Math.round(s.center.y) === 0).sort((a, b) => a.center.x - b.center.x);
      for (const s of lane) expect(s.telegraphStartAt).toBe(1000);
      expect(lane[0]!.impactAt).toBeGreaterThanOrEqual(1000 + def.telegraphMs);
      for (let i = 1; i < lane.length; i++) expect(lane[i]!.impactAt).toBeGreaterThan(lane[i - 1]!.impactAt);
      expect(lane.at(-1)!.impactAt).toBeLessThanOrEqual(1000 + def.telegraphMs + def.flightMs);
    });

    it('wściekłość: pas więcej i krótszy telegraf', () => {
      const angry = planBossAttack(ctx(BossAttackKind.StorkFlight, { enraged: true }));
      expect(angry.throws).toHaveLength(def.lanes + 1);
      expect(angry.throws[0]!.launchAt).toBeLessThan(1000 + def.telegraphMs);
    });
  });

  it('pikowanie: pierwsze miejsce na bohaterze, ptak spada z góry w chwili uderzenia', () => {
    const def = DIRTY_WITCH.birdDive;
    const plan = planBossAttack(ctx(BossAttackKind.BirdDive));
    expect(plan.strikes).toHaveLength(def.zoneCount);
    expect(plan.strikes[0]!.center).toEqual({ x: 200, y: 0 });
    plan.strikes.forEach((strike, i) => {
      expect(strike.look).toBe('dive');
      expect(Math.hypot(strike.center.x - 200, strike.center.y)).toBeLessThanOrEqual(def.spread);
      const bird = plan.throws[i]!;
      expect(bird).toMatchObject({ look: 'bird', to: strike.center, landAt: strike.impactAt, launchAt: strike.impactAt - def.diveMs });
      expect(bird.from.y).toBe(strike.center.y - def.diveHeight);
    });
  });

  describe('kwiat-oko', () => {
    const def = DIRTY_WITCH.flowerEye;
    const plan = planBossAttack(ctx(BossAttackKind.FlowerEye));

    it('nasiona lecą w miejsca wokół bohatera i wyrastają w kwiaty bez działania terenu', () => {
      expect(plan.webs).toHaveLength(def.count);
      plan.webs.forEach((web, i) => {
        const d = Math.hypot(web.to.x - 200, web.to.y);
        expect(d).toBeGreaterThanOrEqual(def.distance.min - 1e-9);
        expect(d).toBeLessThanOrEqual(def.distance.max + 1e-9);
        expect(web.look).toBe('flower');
        expect(web.slow).toBeUndefined();
        expect(web.slip).toBeUndefined();
        expect(web.status).toBeUndefined();
        expect(plan.throws[i]).toMatchObject({ look: 'seed', to: web.to, landAt: web.landAt });
      });
    });

    it('każdy kwiat pulsuje pierścieniami pyłku z tego samego miejsca (wspólny obiekt — przesuwane razem)', () => {
      expect(plan.bursts).toHaveLength(def.count * def.pulses);
      for (const burst of plan.bursts) {
        expect(burst.look).toBe('pollen');
        expect(plan.webs.some((web) => web.to === burst.origin)).toBe(true);
        expect(burst.fireAt - burst.telegraphStartAt).toBe(def.pulseTelegraphMs);
      }
      const last = Math.max(...plan.bursts.map((b) => b.fireAt));
      for (const web of plan.webs) expect(web.expiresAt).toBe(last + def.flower.lingerMs);
    });

    it('wściekłość: o kwiat więcej', () => {
      expect(planBossAttack(ctx(BossAttackKind.FlowerEye, { enraged: true })).webs).toHaveLength(def.count + 1);
    });
  });

  it('wir sukni: fala wokół wiedźmy i pierścień liści w tej samej chwili', () => {
    const plan = planBossAttack(ctx(BossAttackKind.Whirl));
    expect(plan.strikes).toHaveLength(1);
    expect(plan.strikes[0]).toMatchObject({ center: { x: 0, y: 0 }, radius: DIRTY_WITCH.whirl.radius, look: 'whirl' });
    expect(plan.bursts).toHaveLength(1);
    expect(plan.bursts[0]).toMatchObject({ look: 'leaf', fireAt: plan.strikes[0]!.impactAt, count: DIRTY_WITCH.whirl.projectileCount });
  });

  it('druga faza: rój żuków i lot dopiero od wściekłości', () => {
    const brain = new BossBrain(DIRTY_WITCH, createRng(3));
    brain.activate(0);
    const kinds = (hpRatio: number, from: number, count: number): BossAttackKind[] => {
      const out: BossAttackKind[] = [];
      for (let now = from; out.length < count; now += 50) {
        const plan: BossAttackPlan | null = brain.think({ self: { x: 0, y: 0 }, target: { x: 60, y: 0 }, now, hpRatio }).newAttack;
        if (plan && plan.kind !== BossAttackKind.Roar) out.push(plan.kind);
      }
      return out;
    };
    const calm = kinds(1, 0, 12);
    expect(calm).not.toContain(BossAttackKind.Brood);
    expect(calm).not.toContain(BossAttackKind.Leap);
    const angry = kinds(0.3, 200_000, 12);
    expect(angry).toContain(BossAttackKind.Brood);
    expect(angry).toContain(BossAttackKind.Leap);
  });

  it('skalowanie do piętra obejmuje nowe ataki', () => {
    const scaled = scaleBossForFloor(DIRTY_WITCH, 16, ENEMY_SCALING);
    expect(scaled.storkFlight.damage).toBe(scaleForFloor(DIRTY_WITCH.storkFlight.damage, 16, ENEMY_SCALING.damagePerFloor));
    expect(scaled.birdDive.damage).toBe(scaleForFloor(DIRTY_WITCH.birdDive.damage, 16, ENEMY_SCALING.damagePerFloor));
    expect(scaled.flowerEye.damage).toBe(scaleForFloor(DIRTY_WITCH.flowerEye.damage, 16, ENEMY_SCALING.damagePerFloor));
    expect(scaled.whirl.damage).toBe(scaleForFloor(DIRTY_WITCH.whirl.damage, 16, ENEMY_SCALING.damagePerFloor));
  });

  it('wygląd: animacje ataków są w arkuszu wiedźmy, żuki mają własny arkusz z biegiem i zapłonem', () => {
    const visual = BOSS_VISUALS[BossId.DirtyWitch];
    const sheet = SPRITE_SHEETS[visual.sheet];
    for (const kind of [...DIRTY_WITCH.enragedPattern, BossAttackKind.Roar]) {
      const animation = visual.attacks[kind];
      expect(animation, kind).toBeDefined();
      expect(sheet.animations).toHaveProperty(animation!);
    }
    const beetle = spiderlingVisual(DIRTY_WITCH.spiderling.look);
    expect(beetle.sheet).toBe('beetle');
    expect(SPRITE_SHEETS[beetle.sheet].animations).toHaveProperty(beetle.prime);
    expect(spiderlingVisual(undefined).sheet).toBe('spiderling');
  });
});
