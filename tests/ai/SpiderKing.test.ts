import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BossBrain } from '@/ai/BossBrain';
import { attackLeadTimeMs, isInWebPatch, planBossAttack, webPatchRadius } from '@/ai/bossAttacks';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import { createRng } from '@/core/random';
import { SPIDER_KING as KING, SPIDER_QUEEN, bossForFloor, scaleBossForFloor } from '@/config/bossConfig';
import { ENEMY_SCALING, PLAYER_STATUS_RESISTANCE } from '@/config/combatConfig';
import { PLAYER_BASE_STATS } from '@/config/gameConfig';
import { SPRITE_SHEETS } from '@/config/spriteConfig';
import { StatusEffects } from '@/systems/StatusEffects';
import { scaleForFloor } from '@/systems/CombatMath';
import { pixel, readPng } from '../helpers/png';

/** Król Pająków (krok 29): ścięcie kosami z paraliżem, grad sztyletów, rzut kokonem, wysyp grzybni. */
const SELF = { x: 0, y: 0 };
const PLAYER = { x: 0, y: 150 };
const FRAME = 16;

const plan = (kind: BossAttackKind, now = 0, enraged = false, target = PLAYER, seed = 1) =>
  planBossAttack({ kind, definition: KING, self: SELF, target, now, enraged, rng: createRng(seed) });

describe('Król Pająków — wybór i skalowanie', () => {
  it('piętro 3 (Grzybnia) kończy Król Pająków; 2 — Matka Pająków; 4 — Grzybowy Pożeracz; reszta — Strażnik', () => {
    expect(bossForFloor(3).id).toBe(BossId.SpiderKing);
    expect(bossForFloor(2).id).toBe(BossId.SpiderQueen);
    for (const floor of [1, 8]) expect(bossForFloor(floor).id).toBe(BossId.FloorGuardian);
  });

  it('większy i wytrzymalszy od Matki Pająków', () => {
    expect(KING.radius).toBeGreaterThan(SPIDER_QUEEN.radius);
    expect(KING.maxHp).toBeGreaterThan(SPIDER_QUEEN.maxHp);
  });

  it('skalowanie piętra obejmuje ścięcie, sztylety i kokon; paraliż i trucizna grzybni bez zmian', () => {
    const scaled = scaleBossForFloor(KING, 3, ENEMY_SCALING);
    expect(scaled.lash.damage).toBe(scaleForFloor(KING.lash.damage, 3, ENEMY_SCALING.damagePerFloor));
    expect(scaled.flurry.damage).toBe(scaleForFloor(KING.flurry.damage, 3, ENEMY_SCALING.damagePerFloor));
    expect(scaled.cocoonThrow.damage).toBe(scaleForFloor(KING.cocoonThrow.damage, 3, ENEMY_SCALING.damagePerFloor));
    expect(scaled.lash.status).toEqual(KING.lash.status);
    expect(scaled.bloom).toEqual(KING.bloom);
  });
});

describe('Król Pająków — ataki', () => {
  it('ścięcie kosami: strefa przed Królem, paraliż; zasięg sięga gracza z progu wyzwolenia', () => {
    const p = plan(BossAttackKind.Lash, 1000);
    const strike = p.strikes[0]!;
    expect(strike.center).toEqual({ x: 0, y: KING.lash.reach });
    expect(strike.status?.paralysis).toEqual(KING.lash.status.paralysis);
    expect(strike.impactAt).toBe(1000 + KING.lash.telegraphMs);
    expect(KING.lash.reach + KING.lash.radius).toBeGreaterThan(KING.lash.triggerRange);
  });

  it('grad sztyletów: ukłucia w linii w stronę gracza, jedno po drugim; po wściekłości dwa więcej', () => {
    const F = KING.flurry;
    const p = plan(BossAttackKind.Flurry, 500);
    expect(p.strikes).toHaveLength(F.count);
    p.strikes.forEach((s, i) => {
      expect(s.center.x).toBeCloseTo(0);
      expect(s.center.y).toBeCloseTo(F.startDistance + i * F.step);
      expect(s.impactAt).toBe(500 + F.telegraphMs + i * F.intervalMs);
    });
    expect(p.endsAt).toBe(p.strikes.at(-1)!.impactAt + F.recoveryMs);
    expect(plan(BossAttackKind.Flurry, 0, true).strikes).toHaveLength(F.count + 2);
    // Linia sięga gracza stojącego w typowej odległości walki (ok. 150 px).
    expect(F.startDistance + (F.count - 1) * F.step + F.radius).toBeGreaterThan(140);
  });

  it('rzut kokonem: lądowanie na graczu z paraliżem; po wściekłości drugi kokon za graczem', () => {
    const T = KING.cocoonThrow;
    const p = plan(BossAttackKind.CocoonThrow, 0);
    expect(p.throws).toHaveLength(1);
    expect(p.throws[0]!.to).toEqual(PLAYER);
    expect(p.throws[0]!.landAt).toBe(T.telegraphMs + T.flightMs);
    expect(p.strikes[0]!.impactAt).toBe(p.throws[0]!.landAt);
    expect(p.strikes[0]!.status?.paralysis).toEqual(T.paralysis);
    expect(attackLeadTimeMs(p, 0)).toBe(T.telegraphMs);
    const enraged = plan(BossAttackKind.CocoonThrow, 0, true);
    expect(enraged.throws).toHaveLength(2);
    expect(enraged.throws[1]!.to.y).toBeCloseTo(PLAYER.y + T.behindDistance);
  });

  it('tupnięcie: strefa dookoła Króla, wolny telegraf; Król jest szybszy niż dawniej, ale wolniejszy od gracza', () => {
    const p = plan(BossAttackKind.Slam, 200);
    expect(p.strikes[0]!.center).toEqual(SELF);
    expect(p.strikes[0]!.impactAt).toBe(200 + KING.slam.telegraphMs);
    expect(KING.pattern).toContain(BossAttackKind.Slam);
    expect(KING.moveSpeed).toBeGreaterThan(55);
    expect(KING.sprint.speed).toBeLessThan(PLAYER_BASE_STATS.moveSpeed);
    expect(scaleBossForFloor(KING, 3, ENEMY_SCALING).slam.damage).toBe(scaleForFloor(KING.slam.damage, 3, ENEMY_SCALING.damagePerFloor));
  });

  it('wysyp grzybni: pierwszy płat pod graczem, reszta w pierścieniu; płat rośnie, truje i leży długo', () => {
    const B = KING.bloom;
    const p = plan(BossAttackKind.Bloom, 0);
    expect(p.webs).toHaveLength(B.count);
    expect(p.webs[0]!.to).toEqual(PLAYER);
    for (const w of p.webs.slice(1)) {
      const d = Math.hypot(w.to.x - PLAYER.x, w.to.y - PLAYER.y);
      expect(d).toBeGreaterThanOrEqual(B.ring.min - 1e-9);
      expect(d).toBeLessThanOrEqual(B.ring.max + 1e-9);
    }
    const patch = p.webs[0]!;
    expect(patch.look).toBe('mycelium');
    expect(patch.status?.poison).toEqual(B.poison);
    expect(webPatchRadius(patch, patch.landAt - 1)).toBe(0);
    expect(webPatchRadius(patch, patch.landAt + B.spreadMs)).toBe(B.maxRadius);
    expect(isInWebPatch(patch, PLAYER, patch.landAt + 10)).toBe(true);
    expect(patch.expiresAt - patch.landAt).toBe(B.durationMs);
    expect(plan(BossAttackKind.Bloom, 0, true).webs).toHaveLength(B.count + 1);
  });

  it('balans: z płatu pod sobą gracz zdąży wyjść w czasie telegrafu', () => {
    expect((PLAYER_BASE_STATS.moveSpeed * (KING.bloom.telegraphMs * KING.enrage.telegraphMultiplier - 200)) / 1000).toBeGreaterThan(KING.bloom.startRadius + 12);
  });

  it('wzór: zaczyna od grzybni, potem grzybnia, sztylety, kokon i tupnięcie w każdej rundzie (gracz poza zasięgiem kos)', () => {
    const brain = new BossBrain(KING, createRng(1));
    brain.activate(0);
    const kinds: BossAttackKind[] = [];
    for (let now = 0; now < 40_000; now += FRAME) {
      const d = brain.think({ self: SELF, target: { x: 0, y: 200 }, now, hpRatio: 1 });
      if (d.newAttack) kinds.push(d.newAttack.kind);
    }
    expect(kinds[0]).toBe(BossAttackKind.Bloom);
    for (const round of [kinds.slice(0, 4), kinds.slice(4, 8)]) expect([...round].sort()).toEqual([...KING.pattern].sort());
  });
});

describe('paraliż (krok 29)', () => {
  it('trwa zadany czas, potem odporność; drugi paraliż w odporności nie działa', () => {
    const status = new StatusEffects(PLAYER_STATUS_RESISTANCE);
    status.apply({ paralysis: { durationMs: 700 } }, 0);
    expect(status.isParalyzed(0)).toBe(true);
    expect(status.isParalyzed(699)).toBe(true);
    expect(status.isParalyzed(700)).toBe(false);
    status.apply({ paralysis: { durationMs: 1200 } }, 800); // w odporności
    expect(status.isParalyzed(900)).toBe(false);
    const after = 700 + (PLAYER_STATUS_RESISTANCE.paralysisImmunityMs ?? 0);
    status.apply({ paralysis: { durationMs: 1200 } }, after);
    expect(status.isParalyzed(after + 100)).toBe(true);
  });

  it('nowy paraliż nie przedłuża trwającego', () => {
    const status = new StatusEffects(PLAYER_STATUS_RESISTANCE);
    status.apply({ paralysis: { durationMs: 700 } }, 0);
    status.apply({ paralysis: { durationMs: 1200 } }, 500);
    expect(status.isParalyzed(700)).toBe(false);
  });
});

describe('sprite płatu grzybni zgodny z hitboxem', () => {
  it('promień rysunku w klatkach rozrostu = startRadius … maxRadius (±3 px)', () => {
    const sheet = SPRITE_SHEETS.myceliumPatch;
    const png = readPng(fileURLToPath(new URL(`../../public/${sheet.url}`, import.meta.url)));
    const frames = sheet.animations.grow.frames;
    const { startRadius, maxRadius } = KING.bloom;
    frames.forEach((column, i) => {
      const expected = startRadius + ((maxRadius - startRadius) * i) / (frames.length - 1);
      const c = sheet.frameWidth / 2;
      let maxDist = 0;
      for (let y = 0; y < sheet.frameHeight; y++) {
        for (let x = 0; x < sheet.frameWidth; x++) {
          if (pixel(png, column * sheet.frameWidth + x, y)[3] === 0) continue;
          maxDist = Math.max(maxDist, Math.hypot(x + 0.5 - c, y + 0.5 - c));
        }
      }
      expect(Math.abs(maxDist - expected)).toBeLessThanOrEqual(3);
    });
  });
});
