import { describe, expect, it } from 'vitest';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import { SMOKE_BARON, bossForFloor, scaleBossForFloor } from '@/config/bossConfig';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { BOSS_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';
import type { AttackPlanContext } from '@/ai/bossAttacks';
import { planBossAttack } from '@/ai/bossAttacks';
import { BossDogBrain, DogPhase } from '@/ai/BossDogBrain';
import { createRng } from '@/core/random';
import { scaleForFloor } from '@/systems/CombatMath';

describe('Baron Dymu (krok 83)', () => {
  const ctx = (over: Partial<AttackPlanContext>): AttackPlanContext => ({
    kind: BossAttackKind.Smoke,
    definition: SMOKE_BARON,
    self: { x: 0, y: 0 },
    target: { x: 200, y: 0 },
    now: 1000,
    enraged: false,
    rng: createRng(1),
    ...over,
  });

  it('kończy piętro 7 i ma dwa ataki obszarowe poza smugą (brzuch, puszki)', () => {
    expect(bossForFloor(7).id).toBe(BossId.SmokeBaron);
    expect(SMOKE_BARON.pattern).toEqual(expect.arrayContaining([BossAttackKind.Smoke, BossAttackKind.Slam, BossAttackKind.Barrage]));
    expect(SMOKE_BARON.sprint.speed).toBeLessThan(PLAYER_BASE_STATS.moveSpeed);
  });

  it('smuga dymu: ciąg stref od bossa w stronę gracza, rozszerzający się, wszystkie uderzają naraz i przywołują doga', () => {
    const plan = planBossAttack(ctx({}));
    expect(plan.kind).toBe(BossAttackKind.Smoke);
    expect(plan.strikes.length).toBeGreaterThan(5);
    const impact = plan.strikes[0]!.impactAt;
    expect(impact).toBe(1000 + SMOKE_BARON.smoke.telegraphMs);
    expect(plan.strikes.every((s) => s.impactAt === impact && s.summonsDog === true && s.look === 'smoke')).toBe(true);
    const xs = plan.strikes.map((s) => s.center.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(plan.strikes.every((s) => Math.abs(s.center.y) < 1e-9)).toBe(true);
    expect(plan.strikes.at(-1)!.radius).toBeGreaterThan(plan.strikes[0]!.radius);
    expect(xs.at(-1)!).toBeLessThanOrEqual(SMOKE_BARON.smoke.length);
    expect(plan.endsAt).toBe(impact + SMOKE_BARON.smoke.recoveryMs);
  });

  it('wściekłość skraca telegraf smugi', () => {
    const calm = planBossAttack(ctx({}));
    const angry = planBossAttack(ctx({ enraged: true }));
    expect(angry.strikes[0]!.impactAt).toBeLessThan(calm.strikes[0]!.impactAt);
  });

  it('salwa puszek: każda strefa ma puszkę lecącą przez flightMs i lądującą w chwili uderzenia', () => {
    const plan = planBossAttack(ctx({ kind: BossAttackKind.Barrage }));
    expect(plan.throws).toHaveLength(plan.strikes.length);
    plan.throws.forEach((thrown, i) => {
      const strike = plan.strikes[i]!;
      expect(thrown.look).toBe('can');
      expect(thrown.landAt).toBe(strike.impactAt);
      expect(thrown.landAt - thrown.launchAt).toBe(SMOKE_BARON.barrage.thrown.flightMs);
      expect(thrown.to).toEqual(strike.center);
    });
  });

  it('skalowanie piętra obejmuje smugę i doga (HP, skok, kłapnięcie)', () => {
    const scaled = scaleBossForFloor(SMOKE_BARON, 7, ENEMY_SCALING);
    expect(scaled.smoke.damage).toBe(scaleForFloor(SMOKE_BARON.smoke.damage, 7, ENEMY_SCALING.damagePerFloor));
    expect(scaled.dog.maxHp).toBe(scaleForFloor(SMOKE_BARON.dog.maxHp, 7, ENEMY_SCALING.hpPerFloor));
    expect(scaled.dog.lunge.damage).toBe(scaleForFloor(SMOKE_BARON.dog.lunge.damage, 7, ENEMY_SCALING.damagePerFloor));
    expect(scaled.dog.bite.damage).toBe(scaleForFloor(SMOKE_BARON.dog.bite.damage, 7, ENEMY_SCALING.damagePerFloor));
    expect(scaled.dog.lunge.knockback).toBe(SMOKE_BARON.dog.lunge.knockback);
  });

  it('wygląd: animacje ataków istnieją w arkuszu bossa, a dog ma bieg i skok', () => {
    const visual = BOSS_VISUALS[BossId.SmokeBaron];
    const animations: Readonly<Record<string, unknown>> = SPRITE_SHEETS[visual.sheet].animations;
    for (const name of Object.values(visual.attacks)) expect(animations).toHaveProperty(name!);
    expect(visual.attacks[BossAttackKind.Smoke]).toBe('puff');
    expect(SPRITE_SHEETS.blackDog.animations).toHaveProperty('run');
    expect(SPRITE_SHEETS.blackDog.animations).toHaveProperty('lunge');
  });
});

describe('Dog Barona — mózg', () => {
  const def = SMOKE_BARON.dog;
  const BOSS = { x: 0, y: 0 };
  const FAR = { x: 400, y: 0 };

  it('u boku trzyma miejsce obok Barona (z boku względem linii do gracza) i nie rusza, gdy już tam stoi', () => {
    const brain = new BossDogBrain(def);
    const slot = { x: 0, y: def.heelDistance };
    // gracz na wschodzie: miejsce przy boku to (0, +heelDistance)
    const away = brain.think({ self: { x: -100, y: 100 }, boss: BOSS, target: FAR, now: 0 });
    expect(away.phase).toBe(DogPhase.Heel);
    expect(away.speed).toBe(def.moveSpeed);
    expect(away.move.x).toBeGreaterThan(0);
    const there = brain.think({ self: slot, boss: BOSS, target: FAR, now: 0 });
    expect(there.speed).toBe(0);
  });

  it('gracz w zasięgu straży: dog goni i kłapie (strefa przed psem po telegrafie)', () => {
    const brain = new BossDogBrain(def);
    const self = { x: 0, y: 54 };
    const near = { x: def.guardRange - 10, y: 54 };
    const chase = brain.think({ self, boss: BOSS, target: near, now: 0 });
    expect(chase.phase).toBe(DogPhase.Chase);
    const close = { x: def.bite.triggerRange - 4, y: 54 };
    const bite = brain.think({ self, boss: BOSS, target: close, now: 100 });
    expect(bite.phase).toBe(DogPhase.Bite);
    expect(bite.newBite).not.toBeNull();
    expect(bite.newBite!.impactAt).toBe(100 + def.bite.telegraphMs);
    expect(bite.newBite!.center.x).toBeCloseTo(def.bite.reach, 5);
    // w trakcie kłapnięcia stoi, potem wraca do pościgu
    expect(brain.think({ self, boss: BOSS, target: close, now: 200 }).speed).toBe(0);
    const after = brain.think({ self, boss: BOSS, target: FAR, now: bite.newBite!.impactAt + def.bite.recoveryMs });
    expect(after.phase).toBe(DogPhase.Chase);
  });

  it('skok: przysiad w rogu, kierunek blokuje się tuż przed wybiciem, szarża, potem okno na kontrę i pościg', () => {
    const brain = new BossDogBrain(def);
    expect(brain.canSummon(0)).toBe(true);
    const corner = { x: -200, y: -150 };
    brain.summon(1000);
    expect(brain.canSummon(1000)).toBe(false);
    const { lunge } = def;
    const launchAt = 1000 + lunge.telegraphMs;
    // przed zablokowaniem: stoi i nie ma kierunku
    expect(brain.think({ self: corner, boss: BOSS, target: { x: 0, y: 0 }, now: 1100 })).toMatchObject({ phase: DogPhase.Telegraph, speed: 0 });
    expect(brain.lockedDirection).toBeNull();
    // blokada: kierunek na gracza z chwili blokady
    brain.think({ self: corner, boss: BOSS, target: { x: 0, y: 0 }, now: launchAt - lunge.lockBeforeMs });
    const locked = brain.lockedDirection!;
    expect(locked.x).toBeGreaterThan(0);
    expect(locked.y).toBeGreaterThan(0);
    // gracz zmienia miejsce po blokadzie — szarża dalej idzie w zablokowanym kierunku
    const go = brain.think({ self: corner, boss: BOSS, target: { x: -200, y: 200 }, now: launchAt });
    expect(go.phase).toBe(DogPhase.Lunge);
    expect(go.speed).toBe(lunge.speed);
    expect(go.move).toEqual(locked);
    expect(brain.think({ self: corner, boss: BOSS, target: FAR, now: launchAt + lunge.durationMs - 1 }).phase).toBe(DogPhase.Lunge);
    const stop = brain.think({ self: corner, boss: BOSS, target: FAR, now: launchAt + lunge.durationMs });
    expect(stop).toMatchObject({ phase: DogPhase.Recover, speed: 0 });
    const resume = brain.think({ self: corner, boss: BOSS, target: FAR, now: launchAt + lunge.durationMs + lunge.recoveryMs });
    expect(resume.phase).toBe(DogPhase.Chase);
    expect(resume.speed).toBe(def.moveSpeed);
  });

  it('kolejne przywołanie dopiero po odstępie od końca skoku; reset (powrót zabitego) liczy odstęp od nowa', () => {
    const brain = new BossDogBrain(def);
    brain.summon(0);
    const end = def.lunge.telegraphMs + def.lunge.durationMs + def.lunge.recoveryMs;
    brain.think({ self: BOSS, boss: BOSS, target: FAR, now: def.lunge.telegraphMs });
    brain.think({ self: BOSS, boss: BOSS, target: FAR, now: def.lunge.telegraphMs + def.lunge.durationMs });
    brain.think({ self: BOSS, boss: BOSS, target: FAR, now: end });
    expect(brain.phase).toBe(DogPhase.Chase);
    expect(brain.canSummon(end + def.summonCooldownMs - 1)).toBe(false);
    expect(brain.canSummon(end + def.summonCooldownMs)).toBe(true);
    brain.reset(50000);
    expect(brain.phase).toBe(DogPhase.Heel);
    expect(brain.canSummon(50000)).toBe(false);
    expect(brain.canSummon(50000 + def.summonCooldownMs)).toBe(true);
  });
});
