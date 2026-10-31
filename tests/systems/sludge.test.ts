import { describe, expect, it } from 'vitest';
import { BossAttackKind } from '@/core/bossTypes';
import type { AttackPlanContext } from '@/ai/bossAttacks';
import { isInWebPatch, planBossAttack } from '@/ai/bossAttacks';
import { FLOOR_GUARDIAN } from '@/config/bossConfig';
import { SLUDGE_FX, SLUDGE_PUDDLE_RADII, SLUDGE_PUDDLE_SHEETS, sludgePuddleSheet } from '@/config/sludgeConfig';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import { HERO_HURTBOX } from '@/config/combatConfig';
import { createRng } from '@/core/random';
import {
  creepCoverage,
  creepReach,
  creepTargetDepth,
  creepThreshold,
  isHeroInCreep,
  puddlesOverLimit,
  splashSpriteFor,
  stepCreepDepth,
  withSludgePuddles,
} from '@/systems/Sludge';

const sludge = FLOOR_GUARDIAN.sludge;
const creep = sludge.creep;

describe('Król Szlamu (krok 152)', () => {
  const ctx = (kind: BossAttackKind, over: Partial<AttackPlanContext> = {}): AttackPlanContext => ({
    kind,
    definition: FLOOR_GUARDIAN,
    self: { x: 0, y: 0 },
    target: { x: 200, y: 0 },
    now: 1000,
    enraged: false,
    rng: createRng(3),
    ...over,
  });

  it('pluje szlamem: fioletowe strefy, a nie czerwień i ogień', () => {
    expect(FLOOR_GUARDIAN.strikeLook).toBe('sludge');
    expect(FLOOR_GUARDIAN.title).toBe('Król Szlamu');
  });

  it('flegma leci łukiem i pierwsza ląduje tam, dokąd gracz biegnie', () => {
    const plan = planBossAttack(ctx(BossAttackKind.Barrage, { targetVelocity: { x: 0, y: 200 } }));
    expect(plan.throws.length).toBe(plan.strikes.length);
    expect(plan.throws.every((t) => t.look === 'phlegm')).toBe(true);
    const lead = FLOOR_GUARDIAN.barrage.lead;
    expect(plan.strikes[0]!.center).toEqual({ x: 200, y: Math.min(lead.maxPx, (200 * lead.ms) / 1000) });
    // Każda flegma rozlewa kałużę w chwili uderzenia.
    const puddles = plan.webs.filter((w) => w.look === 'sludge');
    expect(puddles.length).toBe(plan.strikes.length);
    puddles.forEach((p, i) => {
      expect(p.to).toEqual(plan.strikes[i]!.center);
      expect(p.landAt).toBe(plan.strikes[i]!.impactAt);
      expect(p.maxRadius).toBe(sludge.puddleRadius[BossAttackKind.Barrage]);
      expect(p.slow).toEqual(sludge.puddle.slow);
    });
  });

  it('rozbryzg wokół siebie i skok zostawiają kałużę, pierścień kul nie (kałuże robią same kule)', () => {
    expect(planBossAttack(ctx(BossAttackKind.Slam)).webs.map((w) => w.maxRadius)).toEqual([sludge.puddleRadius[BossAttackKind.Slam]]);
    expect(planBossAttack(ctx(BossAttackKind.Leap)).webs.map((w) => w.maxRadius)).toEqual([sludge.puddleRadius[BossAttackKind.Leap]]);
    expect(planBossAttack(ctx(BossAttackKind.Nova)).webs).toEqual([]);
  });

  it('ryk wściekłości nie pluje, a boss bez szlamu planuje jak dotąd', () => {
    const roar = { ...planBossAttack(ctx(BossAttackKind.Slam)), kind: BossAttackKind.Roar, webs: [] };
    expect(withSludgePuddles(roar, sludge).webs).toEqual([]);
    const slam = planBossAttack(ctx(BossAttackKind.Slam));
    expect(withSludgePuddles({ ...slam, webs: [] }, undefined).webs).toEqual([]);
  });

  it('kałuża spowalnia ślad stóp (jak strefy na ziemi), rośnie od połowy promienia i znika po czasie', () => {
    const [puddle] = planBossAttack(ctx(BossAttackKind.Slam)).webs;
    if (!puddle) throw new Error('brak kałuży');
    const r = puddle.maxRadius;
    const after = puddle.landAt + puddle.spreadMs;
    // Bohater stoi tuż nad kałużą — jego cień (stopy) jest już w niej.
    const above = { x: puddle.to.x, y: puddle.to.y - r - HERO_HURTBOX.ground.offsetY - HERO_HURTBOX.ground.radius + 1 };
    expect(isInWebPatch(puddle, above, after)).toBe(true);
    expect(isInWebPatch(puddle, { x: puddle.to.x + r * 0.7, y: puddle.to.y }, puddle.landAt)).toBe(false);
    expect(isInWebPatch(puddle, puddle.to, puddle.expiresAt)).toBe(false);
    expect(puddle.startRadius).toBe(r * sludge.puddle.startScale);
  });

  it('kałuże „spowalniają w delikatny sposób”, szlam przy ścianach mocniej, ale da się przejść', () => {
    expect(sludge.puddle.slow.pct).toBeLessThanOrEqual(0.25);
    expect(creep.slow.pct).toBeGreaterThan(sludge.puddle.slow.pct);
    expect(creep.slow.pct).toBeLessThan(0.5);
  });

  it('każdy promień kałuży ma swój arkusz z generatora', () => {
    const radii = [...Object.values(sludge.puddleRadius), sludge.globPuddleRadius];
    for (const r of radii) expect(SLUDGE_PUDDLE_RADII).toContain(r);
    for (const r of SLUDGE_PUDDLE_RADII) {
      const sheet = SPRITE_SHEETS[SLUDGE_PUDDLE_SHEETS[r]];
      expect(sheet.frameWidth).toBe(2 * r + 8);
      expect(sludgePuddleSheet(r)).toBe(SLUDGE_PUDDLE_SHEETS[r]);
    }
  });

  it('limit kałuż: ponad limit znikają najstarsze', () => {
    expect(puddlesOverLimit([1, 2, 3, 4], 2)).toEqual([1, 2]);
    expect(puddlesOverLimit([1, 2], 5)).toEqual([]);
  });

  it('rozbryzg nie wychodzi poza strefę uderzenia (najwyżej o zapas)', () => {
    const def = FLOOR_GUARDIAN;
    const radii = [def.slam.radius, def.barrage.zoneRadius, def.leap.radius, def.enrage.roar.radius, sludge.globPuddleRadius];
    for (const r of radii) {
      const { size, scale } = splashSpriteFor(r, SLUDGE_FX.splashSizes, SLUDGE_FX.splashSlackPx);
      expect(size * scale).toBeLessThanOrEqual(2 * r + SLUDGE_FX.splashSlackPx + (r * 2 < 32 ? 32 : 0));
      // …i pokrywa przynajmniej większość strefy.
      if (r >= 16) expect(size * scale).toBeGreaterThanOrEqual(r * 2 * 0.8);
    }
  });
});

describe('szlam od ścian (krok 152)', () => {
  const arena = { left: 0, top: 0, right: 384, bottom: 384 };

  it('rośnie z czasem walki albo z utraconym HP — liczy się szybszy', () => {
    expect(creepTargetDepth(0, 1, creep)).toBe(0);
    expect(creepTargetDepth(creep.fullAfterMs / 2, 1, creep)).toBeCloseTo(creep.maxDepthPx / 2);
    expect(creepTargetDepth(0, 1 - creep.hpLostForFull / 2, creep)).toBeCloseTo(creep.maxDepthPx / 2);
    expect(creepTargetDepth(creep.fullAfterMs * 3, 0, creep)).toBe(creep.maxDepthPx);
  });

  it('pełznie najwyżej `growPxPerSec` i nigdy się nie cofa', () => {
    expect(stepCreepDepth(0, 40, 1000, creep)).toBeCloseTo(creep.growPxPerSec);
    expect(stepCreepDepth(10, 10.5, 1000, creep)).toBe(10.5);
    expect(stepCreepDepth(20, 5, 1000, creep)).toBe(20);
  });

  it('fala brzegu nie wychodzi poza głębokość i nie znika', () => {
    for (let s = 0; s < 400; s += 7) {
      const r = creepReach(40, s, 1.2, creep);
      expect(r).toBeLessThanOrEqual(40 + 1e-9);
      expect(r).toBeGreaterThanOrEqual(40 * (1 - creep.wobble.amp) - 1e-9);
    }
    expect(creepReach(0, 10, 0, creep)).toBe(0);
  });

  it('rysunek = zasięg: punkt w szlamie dokładnie wtedy, gdy głębokość przekracza jego próg', () => {
    const rng = createRng(11);
    for (let i = 0; i < 400; i++) {
      const p = { x: rng.next() * 384, y: rng.next() * 384 };
      const depth = rng.next() * creep.maxDepthPx;
      const { depth: threshold } = creepThreshold(p, arena, creep);
      const covered = creepCoverage(p, arena, depth, creep) > 0;
      if (Math.abs(threshold - depth) > 1e-6) expect(covered).toBe(depth > threshold);
    }
  });

  it('środek areny zostaje wolny, a przy murze bohater grzęźnie (ślad stóp)', () => {
    const full = creep.maxDepthPx;
    expect(isHeroInCreep({ x: 192, y: 192 }, arena, full, creep)).toBe(false);
    expect(isHeroInCreep({ x: 4, y: 192 }, arena, full, creep)).toBe(true);
    expect(isHeroInCreep({ x: 4, y: 192 }, arena, 0, creep)).toBe(false);
    // Poza areną szlamu nie liczymy.
    expect(creepCoverage({ x: -5, y: 100 }, arena, full, creep)).toBe(-Infinity);
  });

  it('pełny szlam zwęża arenę „delikatnie”: najwyżej 1,5 kafla z każdej strony', () => {
    expect(creep.maxDepthPx).toBeLessThanOrEqual(48);
  });
});
