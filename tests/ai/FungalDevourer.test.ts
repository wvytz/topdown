import { describe, expect, it } from 'vitest';
import { BossBrain } from '@/ai/BossBrain';
import { attackLeadTimeMs, planBossAttack, planFeast } from '@/ai/bossAttacks';
import type { BossAttackPlan } from '@/core/bossTypes';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import { RoomKind, TileType } from '@/core/dungeonTypes';
import { createRng } from '@/core/random';
import { FUNGAL_DEVOURER as DEVOURER, bossForFloor, scaleBossForFloor } from '@/config/bossConfig';
import { ENEMY_SCALING } from '@/config/combatConfig';
import { PLAYER_BASE_STATS, PLAYER_SIZE } from '@/config/gameConfig';
import { planLarders } from '@/dungeon/LarderPlanner';
import { roomContainsTile } from '@/dungeon/rooms';
import { sampleFloors } from '../helpers/floors';

const SELF = { x: 0, y: 0 };
const FRAME = 16;
const F = DEVOURER.feast;

describe('Grzybowy Pożeracz (kroki 33–34) — wybór i definicja', () => {
  it('piętro 4 (Cmentarzysko) kończy Grzybowy Pożeracz', () => {
    expect(bossForFloor(4).id).toBe(BossId.FungalDevourer);
  });

  it('wzór: tasak, szarża, zew; kąsanie poza wzorem leczy Pożeracza', () => {
    expect([...DEVOURER.pattern].sort()).toEqual([BossAttackKind.Call, BossAttackKind.Cleave, BossAttackKind.Leap, BossAttackKind.Slam].sort());
    expect(DEVOURER.lash.healOnHit).toBeGreaterThan(0);
  });

  it('zgniecenie: strefa dookoła Pożeracza z telegrafem; szybszy niż dawniej, ale wolniejszy od gracza', () => {
    const p = planBossAttack({ kind: BossAttackKind.Slam, definition: DEVOURER, self: SELF, target: { x: 150, y: 0 }, now: 100, enraged: false, rng: createRng(1) });
    expect(p.strikes[0]!.center).toEqual(SELF);
    expect(p.strikes[0]!.impactAt).toBe(100 + DEVOURER.slam.telegraphMs);
    expect(DEVOURER.moveSpeed).toBeGreaterThan(60);
    expect(DEVOURER.sprint.speed).toBeLessThan(PLAYER_BASE_STATS.moveSpeed);
  });

  it('skalowanie piętra obejmuje tasak', () => {
    const scaled = scaleBossForFloor(DEVOURER, 4, ENEMY_SCALING);
    expect(scaled.cleave.damage).toBeGreaterThan(DEVOURER.cleave.damage);
  });
});

describe('spiżarnia: planLarders', () => {
  const floors = sampleFloors([4], 30);

  it('kokony przy ścianach areny, na podłodze, z odstępem, poza środkiem; liczba w zakresie', () => {
    floors.forEach((floor, i) => {
      const arena = floor.rooms[floor.bossRoomId]!;
      expect(arena.kind).toBe(RoomKind.Boss);
      const tiles = planLarders(floor, arena, F.larders, createRng(i));
      expect(tiles.length).toBeLessThanOrEqual(F.larders.count.max);
      expect(tiles.length).toBeGreaterThanOrEqual(Math.min(F.larders.count.min, 3));
      const center = { x: arena.x + Math.floor(arena.width / 2), y: arena.y + Math.floor(arena.height / 2) };
      const m = F.larders.wallMarginTiles;
      for (const t of tiles) {
        expect(roomContainsTile(arena, t)).toBe(true);
        expect(floor.tiles[t.y * floor.width + t.x]).toBe(TileType.Floor);
        const ring = t.x === arena.x + m || t.x === arena.x + arena.width - 1 - m || t.y === arena.y + m || t.y === arena.y + arena.height - 1 - m;
        expect(ring).toBe(true);
        expect(Math.max(Math.abs(t.x - center.x), Math.abs(t.y - center.y))).toBeGreaterThan(F.larders.centerClearTiles);
        for (const o of tiles) {
          if (o !== t) expect(Math.max(Math.abs(t.x - o.x), Math.abs(t.y - o.y))).toBeGreaterThanOrEqual(F.larders.minSpacingTiles);
        }
      }
    });
  });

  it('ten sam seed = te same kokony', () => {
    const floor = floors[0]!;
    const arena = floor.rooms[floor.bossRoomId]!;
    expect(planLarders(floor, arena, F.larders, createRng(5))).toEqual(planLarders(floor, arena, F.larders, createRng(5)));
  });
});

/** Mózg w walce: pora uczty od razu, atak ze wzoru odsunięty (sprawdzamy samą ucztę). */
function feasting(): BossBrain {
  const brain = new BossBrain(DEVOURER, createRng(1));
  brain.activate(-F.firstAfterMs);
  brain.delay(1_000_000);
  return brain;
}

describe('uczta', () => {
  const larder = { x: 200, y: 0 };
  const player = { x: -150, y: 0 };

  it('w porze uczty idzie do najbliższego kokonu, a nie do gracza', () => {
    const d = feasting().think({ self: SELF, target: player, now: 0, hpRatio: 1, larders: [larder, { x: 400, y: 0 }] });
    expect(d.newAttack).toBeNull();
    expect(d.move.x).toBeCloseTo(1);
  });

  it('przy kokonie zaczyna ucztę: stoi przez durationMs, kokon znika na końcu', () => {
    const plan = feasting().think({ self: { x: 200 - F.reach, y: 0 }, target: player, now: 0, hpRatio: 1, larders: [larder] }).newAttack!;
    expect(plan.kind).toBe(BossAttackKind.Feast);
    expect(plan.feast).toEqual({ target: larder, at: F.durationMs });
    expect(plan.endsAt).toBe(F.durationMs);
    expect(attackLeadTimeMs(plan, 0)).toBe(F.durationMs);
  });

  it('bez kokonów nie ucztuje — idzie do gracza', () => {
    const d = feasting().think({ self: SELF, target: player, now: 0, hpRatio: 1, larders: [] });
    expect(d.move.x).toBeCloseTo(-1);
  });

  it('następna uczta po cooldownMs; po wściekłości częściej', () => {
    const firstFeast = (hpRatio: number) => {
      const brain = feasting();
      const self = { x: 200 - F.reach, y: 0 };
      const first = brain.think({ self, target: player, now: 0, hpRatio, larders: [larder] }).newAttack!;
      for (let now = 0; now < 40_000; now += FRAME) {
        const d = brain.think({ self, target: player, now, hpRatio, larders: [larder] });
        if (d.newAttack?.kind === BossAttackKind.Feast && now > first.endsAt) return now - first.endsAt;
      }
      return Infinity;
    };
    const calm = firstFeast(1);
    const hungry = firstFeast(0.2);
    expect(calm).toBeGreaterThanOrEqual(F.cooldownMs);
    expect(calm).toBeLessThan(F.cooldownMs + FRAME * 2);
    expect(hungry).toBeLessThan(calm);
  });

  it('stosy uczt: do maxStacks; zwiększają obrażenia stref i chód', () => {
    const brain = feasting();
    for (let i = 0; i < F.maxStacks + 3; i++) brain.feasted();
    expect(brain.feastStacks).toBe(F.maxStacks);
    const fresh = new BossBrain(DEVOURER, createRng(1));
    fresh.activate(0);
    const strong = new BossBrain(DEVOURER, createRng(1));
    strong.activate(0);
    for (let i = 0; i < 2; i++) strong.feasted();
    // Kąsanie z bliska (poza wzorem) — porównujemy obrażenia strefy i prędkość z daleka.
    const bite = (b: BossBrain) => b.think({ self: SELF, target: { x: 40, y: 0 }, now: 100, hpRatio: 1 }).newAttack!.strikes[0]!.damage;
    expect(bite(strong)).toBe(Math.round(DEVOURER.lash.damage * (1 + 2 * F.damagePerStack)));
    expect(bite(fresh)).toBe(DEVOURER.lash.damage);
    const speed = (b: BossBrain) => b.think({ self: SELF, target: { x: 1000, y: 0 }, now: 99_000, hpRatio: 1 }).speed;
    const s1 = new BossBrain(DEVOURER, createRng(1));
    s1.activate(0);
    s1.delay(1_000_000);
    const s2 = new BossBrain(DEVOURER, createRng(1));
    s2.activate(0);
    s2.delay(1_000_000);
    s2.feasted();
    expect(speed(s2)).toBeCloseTo(speed(s1) * (1 + F.speedPerStack));
  });

  it('planFeast bez definicji uczty to błąd konfiguracji', () => {
    expect(() => planFeast(bossForFloor(1), SELF, 0)).toThrow(/uczta/);
  });
});

describe('ciosy Pożeracza', () => {
  const plan = (kind: BossAttackKind, target = { x: 50, y: 0 }, enraged = false): BossAttackPlan =>
    planBossAttack({ kind, definition: DEVOURER, self: SELF, target, now: 0, enraged, rng: createRng(1) });

  it('tasak: szeroka strefa przed Pożeraczem, długi zamach', () => {
    const p = plan(BossAttackKind.Cleave);
    const strike = p.strikes[0]!;
    expect(strike.center).toEqual({ x: DEVOURER.cleave.reach, y: 0 });
    expect(strike.radius).toBe(DEVOURER.cleave.radius);
    expect(strike.impactAt).toBe(DEVOURER.cleave.telegraphMs);
    expect(p.endsAt).toBe(DEVOURER.cleave.telegraphMs + DEVOURER.cleave.recoveryMs);
  });

  it('balans: uważny gracz przy Pożeraczu zdąży wyjść ze strefy tasaka (także po wściekłości)', () => {
    const r = PLAYER_SIZE / 2;
    const fromCenter = DEVOURER.engageDistance - DEVOURER.cleave.reach;
    const escape = DEVOURER.cleave.radius + r - fromCenter;
    const time = DEVOURER.cleave.telegraphMs * DEVOURER.enrage.telegraphMultiplier - 200;
    expect((PLAYER_BASE_STATS.moveSpeed * time) / 1000).toBeGreaterThan(escape);
  });

  it('kąsanie: strefa niesie leczenie Lorda', () => {
    expect(plan(BossAttackKind.Lash, { x: 40, y: 0 }).strikes[0]!.healOnHit).toBe(DEVOURER.lash.healOnHit);
  });

  it('zew: jeden kokon pęka po telegrafie, po wściekłości dwa', () => {
    const calm = plan(BossAttackKind.Call);
    expect(calm.release).toEqual({ count: DEVOURER.call.count, telegraphStartAt: 0, at: DEVOURER.call.telegraphMs });
    expect(plan(BossAttackKind.Call, undefined, true).release!.count).toBe(DEVOURER.call.count + 1);
  });

  it('szarża z kłapnięciem: skok na miejsce gracza ze strefą lądowania', () => {
    const p = plan(BossAttackKind.Leap, { x: 120, y: 0 });
    expect(p.leap?.to).toEqual({ x: 120, y: 0 });
    expect(p.strikes[0]!.radius).toBe(DEVOURER.leap.radius);
  });

  it('uczta nie jest atakiem ze wzoru', () => {
    expect(() => plan(BossAttackKind.Feast)).toThrow(/uczta/);
  });
});
