import { describe, expect, it } from 'vitest';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import { CLEANER_BLONDE, CLEANER_DARK, bossForFloor, scaleBossForFloor } from '@/config/bossConfig';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { BOSS_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';
import type { AttackPlanContext } from '@/ai/bossAttacks';
import { isInWebPatch, planBossAttack } from '@/ai/bossAttacks';
import { BossBrain } from '@/ai/BossBrain';
import { createRng } from '@/core/random';
import { scaleForFloor } from '@/systems/CombatMath';
import { ShoutSchedule } from '@/systems/BossShouts';
import { EscapeStage, escapeCappedDamage, escapeStage, shouldEscape } from '@/systems/BossEscape';
import { slideVelocity } from '@/systems/Slip';

describe('blond sprzątaczka (krok 125)', () => {
  const ctx = (over: Partial<AttackPlanContext>): AttackPlanContext => ({
    kind: BossAttackKind.Spill,
    definition: CLEANER_BLONDE,
    self: { x: 0, y: 0 },
    target: { x: 150, y: 0 },
    now: 1000,
    enraged: false,
    rng: createRng(1),
    ...over,
  });

  it('kończy piętro 7 (Lustrzana komnata, piętro A); chlust i miotła we wzorze, wiadro poza nim', () => {
    expect(bossForFloor(7).id).toBe(BossId.CleanerBlonde);
    expect(CLEANER_BLONDE.pattern).toEqual(expect.arrayContaining([BossAttackKind.Spill, BossAttackKind.Cleave]));
    expect(CLEANER_BLONDE.hook.look).toBe('bucket');
    expect(CLEANER_BLONDE.sprint.speed).toBeLessThan(PLAYER_BASE_STATS.moveSpeed);
  });

  it('chlust: strefa na graczu i kałuże — pierwsza pod nim, reszta za nim; wszystkie z poślizgiem, bez spowolnienia', () => {
    const plan = planBossAttack(ctx({}));
    const impactAt = 1000 + CLEANER_BLONDE.spill.telegraphMs;
    expect(plan.strikes).toHaveLength(1);
    expect(plan.strikes[0]).toMatchObject({ center: { x: 150, y: 0 }, impactAt, look: 'water' });
    expect(plan.webs).toHaveLength(CLEANER_BLONDE.spill.count);
    expect(plan.webs[0]!.to).toEqual({ x: 150, y: 0 });
    for (const web of plan.webs) {
      expect(web.look).toBe('water');
      expect(web.slip).toEqual(CLEANER_BLONDE.spill.slip);
      expect(web.slow).toBeUndefined();
      expect(web.landAt).toBe(impactAt);
      expect(web.expiresAt - web.landAt).toBe(CLEANER_BLONDE.spill.puddle.durationMs);
    }
    // Dalsze kałuże leżą za graczem (dalej od bossa).
    for (const web of plan.webs.slice(1)) expect(Math.hypot(web.to.x, web.to.y)).toBeGreaterThan(150);
    expect(plan.endsAt).toBe(impactAt + CLEANER_BLONDE.spill.recoveryMs);
  });

  it('wściekłość: kałuża więcej i krótszy zamach', () => {
    const angry = planBossAttack(ctx({ enraged: true }));
    expect(angry.webs).toHaveLength(CLEANER_BLONDE.spill.count + 1);
    expect(angry.strikes[0]!.impactAt).toBeLessThan(1000 + CLEANER_BLONDE.spill.telegraphMs);
  });

  it('kałuża łapie ślad stóp (jak grzyby), nie środek postaci', () => {
    const [web] = planBossAttack(ctx({})).webs;
    const at = web!.landAt + CLEANER_BLONDE.spill.puddle.spreadMs;
    const r = CLEANER_BLONDE.spill.puddle.maxRadius;
    expect(isInWebPatch(web!, { x: 150, y: 0 }, at)).toBe(true);
    // Środek postaci nad kałużą, stopy w niej (postać stoi „powyżej” krawędzi).
    expect(isInWebPatch(web!, { x: 150, y: -r - 2 }, at)).toBe(true);
    expect(isInWebPatch(web!, { x: 150, y: r + 30 }, at)).toBe(false);
  });

  it('wiadro na sznurze: linia stref ściąga pod stopy, wiadro leci i ląduje w chwili uderzenia, potem miotła', () => {
    const plan = planBossAttack(ctx({ kind: BossAttackKind.Hook, target: { x: 200, y: 0 } }));
    const pulls = plan.strikes.filter((s) => s.pullTo);
    expect(pulls.length).toBeGreaterThan(3);
    expect(plan.throws).toHaveLength(1);
    const [bucket] = plan.throws;
    expect(bucket!.look).toBe('bucket');
    expect(bucket!.landAt).toBe(pulls[0]!.impactAt);
    expect(bucket!.to).toEqual(pulls.at(-1)!.center);
    const sweep = plan.strikes.at(-1)!;
    expect(sweep.pullTo).toBeUndefined();
    expect(sweep.impactAt).toBe(pulls[0]!.impactAt + CLEANER_BLONDE.hook.followUp.delayMs);
  });

  it('wiadro poza wzorem: gracz trzyma dystans → boss ściąga go wiadrem', () => {
    const brain = new BossBrain(CLEANER_BLONDE, createRng(3));
    brain.activate(0);
    const far = brain.think({ self: { x: 0, y: 0 }, target: { x: 200, y: 0 }, now: CLEANER_BLONDE.openingDelayMs * 0.75, hpRatio: 1 });
    expect(far.newAttack?.kind).toBe(BossAttackKind.Hook);
  });

  it('skalowanie piętra obejmuje chlust; poślizg bez zmian', () => {
    const scaled = scaleBossForFloor(CLEANER_BLONDE, 8, ENEMY_SCALING);
    expect(scaled.spill.damage).toBe(scaleForFloor(CLEANER_BLONDE.spill.damage, 8, ENEMY_SCALING.damagePerFloor));
    expect(scaled.spill.slip).toEqual(CLEANER_BLONDE.spill.slip);
    expect(scaled.hook.look).toBe('bucket');
  });

  it('wściekłość przychodzi przed ucieczką', () => {
    expect(CLEANER_BLONDE.enrage.hpThreshold).toBeGreaterThan(CLEANER_BLONDE.escape.hpRatio);
  });

  it('wygląd: arkusz 28 klatek × 8 kierunków; chlust, wiadro, miotła i krzyk mają animacje; stojąc poleruje', () => {
    const visual = BOSS_VISUALS[BossId.CleanerBlonde];
    const sheet = SPRITE_SHEETS[visual.sheet];
    expect(sheet.sheetWidth / sheet.frameWidth).toBe(28);
    expect(sheet.directions).toBe(8);
    for (const kind of [BossAttackKind.Spill, BossAttackKind.Hook, BossAttackKind.Cleave, BossAttackKind.Roar]) {
      expect(visual.attacks[kind], kind).toBeDefined();
      expect(sheet.animations).toHaveProperty(visual.attacks[kind]!);
    }
    expect(visual.idle).toBe('polish');
  });
});

describe('ucieczka windą (krok 125)', () => {
  const escape = CLEANER_BLONDE.escape;

  it('przy 1/3 HP (i niżej), nie wcześniej', () => {
    expect(escape.hpRatio).toBeCloseTo(1 / 3);
    expect(shouldEscape(600, 600, escape)).toBe(false);
    expect(shouldEscape(201, 600, escape)).toBe(false);
    expect(shouldEscape(200, 600, escape)).toBe(true);
    expect(shouldEscape(1, 600, escape)).toBe(true);
    expect(shouldEscape(1, 600, undefined)).toBe(false);
  });

  it('trafienie nie zbija poniżej 1 HP — ucieczka zawsze nastąpi; boss bez ucieczki dostaje całość', () => {
    expect(escapeCappedDamage(500, 300, escape)).toBe(299);
    expect(escapeCappedDamage(20, 300, escape)).toBe(20);
    expect(escapeCappedDamage(20, 1, escape)).toBe(0);
    expect(escapeCappedDamage(500, 300, undefined)).toBe(500);
  });

  it('etapy: bieg do windy, wsiadanie, zamykanie drzwi, odjazd', () => {
    expect(escapeStage(null, 5000, escape)).toBe(EscapeStage.Running);
    expect(escapeStage(1000, 1000, escape)).toBe(EscapeStage.Boarding);
    expect(escapeStage(1000, 1000 + escape.boardMs, escape)).toBe(EscapeStage.Closing);
    expect(escapeStage(1000, 1000 + escape.boardMs + escape.closeMs, escape)).toBe(EscapeStage.Gone);
  });
});

describe('okrzyki (krok 125)', () => {
  const shouts = CLEANER_BLONDE.shouts;

  it('teksty z konceptu, w tym „Nie chodź po mokrym!”; atak ma swój okrzyk, ale nie częściej niż co minGapMs', () => {
    expect(shouts.idle).toContain('Nie chodź po mokrym!');
    const s = new ShoutSchedule(shouts, createRng(1));
    expect(s.onAttack(BossAttackKind.Hook, 1000)).toBe('Do wiadra z tobą!');
    expect(s.onAttack(BossAttackKind.Spill, 1000 + shouts.minGapMs - 1)).toBeNull();
    expect(shouts.attacks[BossAttackKind.Spill]).toContain(s.onAttack(BossAttackKind.Spill, 1000 + shouts.minGapMs));
    expect(s.onAttack(BossAttackKind.Slam, 99999)).toBeNull();
  });

  it('okrzyk z nudów po losowym odstępie z przedziału, ta sama linia nie dwa razy z rzędu', () => {
    const s = new ShoutSchedule(shouts, createRng(7));
    s.start(0);
    expect(s.idle(shouts.everyMs.min - 1)).toBeNull();
    const lines: string[] = [];
    for (let now = 0; now < 200000; now += 100) {
      const line = s.idle(now);
      if (line) lines.push(line);
    }
    expect(lines.length).toBeGreaterThan(200000 / shouts.everyMs.max - 2);
    expect(lines.length).toBeLessThan(200000 / shouts.everyMs.min + 2);
    for (let i = 1; i < lines.length; i++) expect(lines[i]).not.toBe(lines[i - 1]);
    for (const line of lines) expect(shouts.idle).toContain(line);
  });

  it('deterministyczne z tego samego ziarna', () => {
    const run = () => {
      const s = new ShoutSchedule(shouts, createRng(42));
      s.start(0);
      return Array.from({ length: 300 }, (_, i) => s.idle(i * 100)).filter(Boolean);
    };
    expect(run()).toEqual(run());
  });
});

describe('poślizg (krok 125)', () => {
  const traction = CLEANER_BLONDE.spill.slip.traction;

  it('po puszczeniu klawiszy bohater sunie dalej i powoli hamuje', () => {
    const v0 = { x: 200, y: 0 };
    const after100 = slideVelocity(v0, { x: 0, y: 0 }, 100, traction);
    expect(after100.x).toBeGreaterThan(150);
    let v = v0;
    for (let t = 0; t < 2000; t += 16) v = slideVelocity(v, { x: 0, y: 0 }, 16, traction);
    expect(Math.abs(v.x)).toBeLessThan(5);
  });

  it('skręt z bezwładnością: kierunek dochodzi do zamierzonego stopniowo, bez przekraczania prędkości', () => {
    const v = slideVelocity({ x: 200, y: 0 }, { x: 0, y: 200 }, 100, traction);
    expect(v.x).toBeGreaterThan(100);
    expect(v.y).toBeGreaterThan(0);
    expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(200);
  });

  it('niezależne od klatek: dwa kroki po 50 ms = jeden po 100 ms', () => {
    const once = slideVelocity({ x: 200, y: 0 }, { x: 0, y: 0 }, 100, traction);
    const twice = slideVelocity(slideVelocity({ x: 200, y: 0 }, { x: 0, y: 0 }, 50, traction), { x: 0, y: 0 }, 50, traction);
    expect(twice.x).toBeCloseTo(once.x, 6);
  });
});

describe('czarnowłosa sprzątaczka (krok 126)', () => {
  const ctx = (over: Partial<AttackPlanContext>): AttackPlanContext => ({
    kind: BossAttackKind.Tangle,
    definition: CLEANER_DARK,
    self: { x: 0, y: 0 },
    target: { x: 120, y: 40 },
    targetVelocity: { x: 0, y: 150 },
    now: 1000,
    enraged: false,
    rng: createRng(2),
    ...over,
  });

  it('kończy piętro 8; miotła, plątanie i chlust we wzorze, bez wiadra i bez ucieczki', () => {
    expect(bossForFloor(8).id).toBe(BossId.CleanerDark);
    expect(CLEANER_DARK.pattern).toEqual(expect.arrayContaining([BossAttackKind.Cleave, BossAttackKind.Tangle, BossAttackKind.Spill]));
    expect('hook' in CLEANER_DARK).toBe(false);
    expect('escape' in CLEANER_DARK).toBe(false);
    expect(CLEANER_DARK.sprint.speed).toBeLessThan(PLAYER_BASE_STATS.moveSpeed);
  });

  it('plątanie: strefa pod graczem unieruchamia (z odpornością po), lekkie obrażenia', () => {
    const plan = planBossAttack(ctx({}));
    expect(plan.kind).toBe(BossAttackKind.Tangle);
    expect(plan.strikes).toHaveLength(1);
    expect(plan.strikes[0]).toMatchObject({ center: { x: 120, y: 40 }, look: 'tangle', root: CLEANER_DARK.tangle.root });
    expect(plan.strikes[0]!.impactAt).toBe(1000 + CLEANER_DARK.tangle.telegraphMs);
    expect(CLEANER_DARK.tangle.root.immunityMs).toBeGreaterThan(CLEANER_DARK.tangle.root.durationMs);
    expect(CLEANER_DARK.tangle.damage).toBeLessThan(CLEANER_DARK.cleave.damage);
  });

  it('wściekłość: druga strefa tam, dokąd bohater biegnie', () => {
    const plan = planBossAttack(ctx({ enraged: true }));
    expect(plan.strikes).toHaveLength(2);
    expect(plan.strikes[1]!.center.y).toBeGreaterThan(40);
  });

  it('chlust z jedną kałużą (mniej poślizgu niż u blondynki)', () => {
    const plan = planBossAttack(ctx({ kind: BossAttackKind.Spill }));
    expect(plan.webs).toHaveLength(1);
    expect(CLEANER_DARK.spill.count).toBeLessThan(CLEANER_BLONDE.spill.count);
  });

  it('skalowanie piętra obejmuje plątanie; czas unieruchomienia bez zmian', () => {
    const scaled = scaleBossForFloor(CLEANER_DARK, 16, ENEMY_SCALING);
    expect(scaled.tangle.damage).toBe(scaleForFloor(CLEANER_DARK.tangle.damage, 16, ENEMY_SCALING.damagePerFloor));
    expect(scaled.tangle.root).toEqual(CLEANER_DARK.tangle.root);
  });

  it('wygląd: wspólny model, miotła i plątanie mają animacje; zwłoki zostają', () => {
    const visual = BOSS_VISUALS[BossId.CleanerDark];
    const sheet = SPRITE_SHEETS[visual.sheet];
    expect(sheet.sheetWidth / sheet.frameWidth).toBe(28);
    for (const kind of [BossAttackKind.Cleave, BossAttackKind.Tangle, BossAttackKind.Spill]) {
      expect(sheet.animations).toHaveProperty(visual.attacks[kind]!);
    }
    expect(visual.idle).toBe('polish');
  });
});
