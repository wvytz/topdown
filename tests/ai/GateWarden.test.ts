import { describe, expect, it } from 'vitest';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import { ABYSS_EXECUTIONER, GATE_WARDEN, bossForFloor } from '@/config/bossConfig';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import type { AttackPlanContext } from '@/ai/bossAttacks';
import { planBossAttack } from '@/ai/bossAttacks';
import { BossBrain } from '@/ai/BossBrain';
import { RoomKind } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { arenaBrazierSpots } from '@/dungeon/BrazierPlanner';
import { ShieldGuard, fireRingRadius } from '@/systems/Shield';
import { BOSS_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';

describe('Strażnik Bram (krok 41e)', () => {
  it('kończy piętro 5 (Piekło)', () => {
    expect(bossForFloor(5).id).toBe(BossId.GateWarden);
  });

  it('ma tarczę z przodu: stożek węższy niż pół okręgu (da się go obejść), obraca się wolniej niż gracz go okrąża', () => {
    const shield = GATE_WARDEN.shield;
    expect(shield.arcDeg).toBeGreaterThan(60);
    expect(shield.arcDeg).toBeLessThan(180);
    // Gracz (200 px/s) okrążający bossa w odległości ok. 80 px obiega go szybciej, niż tarcza się obraca.
    const playerDegPerSec = ((200 / 80) * 180) / Math.PI;
    expect(shield.turnRateDegPerSec).toBeLessThan(playerDegPerSec);
    expect(shield.frontMeleeMultiplier).toBeLessThan(1);
  });

  it('po ataku Strażnik i Kat opuszczają tarczę krócej niż trwa odpoczynek — okno na combo przed kolejnym atakiem (krok 111)', () => {
    for (const boss of [GATE_WARDEN, ABYSS_EXECUTIONER]) {
      expect(boss.shield.loweredAfterAttackMs).toBeGreaterThanOrEqual(1000);
      expect(boss.shield.loweredAfterAttackMs).toBeLessThanOrEqual(boss.restBetweenAttacksMs);
      expect(boss.shield.reflectSpread.minDeg).toBeGreaterThan(0);
    }
  });

  it('wzór: wirujący łańcuch dookoła (karze stanie za plecami) i uderzenie tarczą przed sobą', () => {
    expect(GATE_WARDEN.pattern).toEqual(expect.arrayContaining([BossAttackKind.Slam, BossAttackKind.Cleave]));
    expect(GATE_WARDEN.slam.radius).toBeGreaterThan(GATE_WARDEN.radius * 2);
  });

  it('wzmocnienie: skok na gracza w wzorze, szybszy chód i sprint (wolniejszy od gracza)', () => {
    expect(GATE_WARDEN.pattern).toContain(BossAttackKind.Leap);
    expect(GATE_WARDEN.moveSpeed).toBeGreaterThan(62);
    expect(GATE_WARDEN.sprint.speed).toBeLessThan(PLAYER_BASE_STATS.moveSpeed);
  });

  it('wytrzymałość tarczy: Strażnik i Kat ją mają; pęknięcie trwa kilka sekund i wymaga kilku ciosów', () => {
    for (const boss of [GATE_WARDEN, ABYSS_EXECUTIONER]) {
      const guard = boss.shield.guard;
      expect(guard.hp).toBeGreaterThan(0);
      expect(guard.breakMs).toBeGreaterThanOrEqual(2000);
    }
    expect(ABYSS_EXECUTIONER.shield.heat.ticks).toBeGreaterThan(0); // rozgrzewanie promieniem zostaje
  });

  it('ShieldGuard: ciosy zbijają tarczę, zero ją pęka na czas, potem wraca pełna', () => {
    const guard = new ShieldGuard(50, 3000);
    expect(guard.absorb(20, 0)).toBe(false);
    expect(guard.fraction(0)).toBeCloseTo(0.6);
    expect(guard.absorb(30, 100)).toBe(true);
    expect(guard.isBroken(2000)).toBe(true);
    expect(guard.fraction(2000)).toBe(0);
    expect(guard.absorb(99, 2000)).toBe(false); // pęknięta nie przyjmuje ciosów
    expect(guard.isBroken(3100)).toBe(false);
    expect(guard.fraction(3100)).toBe(1);
  });

  it('wygląd: animacje ataków istnieją w arkuszu', () => {
    const visual = BOSS_VISUALS[BossId.GateWarden];
    const animations: Readonly<Record<string, unknown>> = SPRITE_SHEETS[visual.sheet].animations;
    for (const name of Object.values(visual.attacks)) expect(animations).toHaveProperty(name!);
  });
});

describe('Kat Otchłani — wzmocnienie bossów', () => {
  it('skok w wzorze, szybszy chód i sprint (wolniejszy od gracza)', () => {
    expect(ABYSS_EXECUTIONER.pattern).toContain(BossAttackKind.Leap);
    expect(ABYSS_EXECUTIONER.moveSpeed).toBeGreaterThan(66);
    expect(ABYSS_EXECUTIONER.sprint.speed).toBeLessThan(PLAYER_BASE_STATS.moveSpeed);
  });
});

describe('Kat Otchłani (krok 41f)', () => {
  const ctx = (over: Partial<AttackPlanContext>): AttackPlanContext => ({
    kind: BossAttackKind.Hook,
    definition: ABYSS_EXECUTIONER,
    self: { x: 0, y: 0 },
    target: { x: 200, y: 0 },
    now: 1000,
    enraged: false,
    rng: createRng(1),
    ...over,
  });

  it('kończy piętro 6 i ma tarczę jak Strażnik Bram, ale rozgrzewaną promieniem', () => {
    expect(bossForFloor(6).id).toBe(BossId.AbyssExecutioner);
    expect(ABYSS_EXECUTIONER.shield.heat.ticks).toBeGreaterThan(0);
  });

  it('hak: linia stref do gracza (do maxRange), trafienie przyciąga pod tarczę, potem uderzenie tarczą', () => {
    const plan = planBossAttack(ctx({}));
    const hookStrikes = plan.strikes.filter((s) => s.pullTo);
    const last = hookStrikes.at(-1)!;
    expect(hookStrikes.length).toBeGreaterThan(3);
    expect(last.center.x).toBeLessThanOrEqual(ABYSS_EXECUTIONER.hook.maxRange);
    expect(last.center.x).toBeGreaterThan(200 - ABYSS_EXECUTIONER.hook.step);
    expect(hookStrikes.every((s) => s.pullTo!.x < 60 && s.pullTo!.x > 0)).toBe(true);
    const bash = plan.strikes.find((s) => !s.pullTo)!;
    expect(bash.impactAt).toBe(hookStrikes[0]!.impactAt + ABYSS_EXECUTIONER.hook.followUp.delayMs);
  });

  it('hak tylko na gracza trzymającego dystans (poza wzorem, z odstępem)', () => {
    const brain = new BossBrain(ABYSS_EXECUTIONER, createRng(3));
    brain.activate(0);
    const early = brain.think({ self: { x: 0, y: 0 }, target: { x: 200, y: 0 }, now: 100, hpRatio: 1 });
    expect(early.newAttack).toBeNull(); // otwarcie walki
    const far = brain.think({ self: { x: 0, y: 0 }, target: { x: 200, y: 0 }, now: ABYSS_EXECUTIONER.openingDelayMs * 0.75, hpRatio: 1 });
    expect(far.newAttack?.kind).toBe(BossAttackKind.Hook);
    const again = brain.think({ self: { x: 0, y: 0 }, target: { x: 200, y: 0 }, now: far.newAttack!.endsAt + 10, hpRatio: 1 });
    expect(again.newAttack?.kind).not.toBe(BossAttackKind.Hook);
  });

  it('oddech palenisk: strefa na każdym palenisku areny, wszystkie naraz', () => {
    const braziers = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }];
    const plan = planBossAttack(ctx({ kind: BossAttackKind.Kindle, braziers }));
    expect(plan.strikes.map((s) => s.center)).toEqual(braziers);
    expect(new Set(plan.strikes.map((s) => s.impactAt)).size).toBe(1);
  });

  it('paleniska areny w ćwiartkach, środek wolny', () => {
    const arena = { id: 0, x: 10, y: 10, width: 12, height: 12, kind: RoomKind.Boss };
    const spots = arenaBrazierSpots(arena, 4);
    expect(spots).toHaveLength(4);
    for (const s of spots) expect(Math.max(Math.abs(s.x - 16), Math.abs(s.y - 16))).toBeGreaterThanOrEqual(2);
  });

  it('pierścień ognia kurczy się do minimum i dalej nie maleje', () => {
    expect(fireRingRadius(200, 110, 25000, 0)).toBe(200);
    expect(fireRingRadius(200, 110, 25000, 12500)).toBeCloseTo(155);
    expect(fireRingRadius(200, 110, 25000, 60000)).toBe(110);
  });
});
