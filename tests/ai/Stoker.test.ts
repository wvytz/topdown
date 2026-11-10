import { describe, expect, it } from 'vitest';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import type { GrateRow } from '@/core/bossTypes';
import { createRng } from '@/core/random';
import { STOKER, bossForFloor } from '@/config/bossConfig';
import { BOSS_VISUALS, SPRITE_SHEETS } from '@/config/spriteConfig';
import { RELIC_CONFIG } from '@/config/relicConfig';
import { planBossAttack } from '@/ai/bossAttacks';
import type { AttackPlanContext } from '@/ai/bossAttacks';
import { planOverheatVent } from '@/ai/stokerAttacks';
import { BossBrain } from '@/ai/BossBrain';
import { planArenaGrates } from '@/dungeon/GratePlanner';
import { findRoomEntrances } from '@/dungeon/arenaGates';
import { TileType } from '@/core/dungeonTypes';
import { sampleFloors } from '../helpers/floors';

/** Palacz (krok 182, `#palacz`): boss Piekła na piętrze 4 zamiast Kata Otchłani. */
const rows: GrateRow[] = [
  { set: 0, points: [{ x: 0, y: 0 }, { x: 32, y: 0 }] },
  { set: 1, points: [{ x: 0, y: 96 }, { x: 32, y: 96 }, { x: 64, y: 96 }] },
];
const ctx = (over: Partial<AttackPlanContext> = {}): AttackPlanContext => ({
  kind: BossAttackKind.Grate,
  definition: STOKER,
  self: { x: 0, y: 200 },
  target: { x: 100, y: 200 },
  now: 1000,
  enraged: false,
  rng: createRng(1),
  grates: rows,
  ...over,
});

describe('Palacz: miejsce we wspinaczce', () => {
  it('kończy piętro 4 zamiast Kata; drzwiczki pochłaniają pociski zamiast je odbijać, przegrzane buchają', () => {
    expect(bossForFloor(4).id).toBe(BossId.Stoker);
    expect(STOKER.shield.absorbShots).toBe(true);
    expect(STOKER.shield.guard.hp).toBeGreaterThan(0);
    expect(STOKER.shield.overheat.staggerMs).toBeGreaterThan(STOKER.shield.loweredAfterAttackMs);
    expect(RELIC_CONFIG.byFloorInLoop[4]).toBeDefined();
  });

  it('każdy atak ze wzoru ma definicję i animację, a arkusz ma 20 kolumn i 8 kierunków', () => {
    const visual = BOSS_VISUALS[BossId.Stoker];
    for (const kind of STOKER.pattern) expect(visual.attacks[kind], kind).toBeDefined();
    const sheet = SPRITE_SHEETS[visual.sheet];
    expect(sheet.sheetWidth / sheet.frameWidth).toBe(20);
    expect(sheet.sheetHeight / sheet.frameHeight).toBe(8);
  });
});

describe('Palacz: ruszt', () => {
  it('buchają tylko kafle wybranego zestawu, wszystkie naraz po telegrafie', () => {
    const plan = planBossAttack(ctx({ grateSet: 1 }));
    expect(plan.strikes).toHaveLength(3);
    expect(plan.strikes.every((s) => s.center.y === 96 && s.impactAt === 1000 + STOKER.grate.telegraphMs && s.look === 'grate')).toBe(true);
  });

  it('we wściekłości drugi zestaw buchnie później, a jego telegraf zaczyna się z uderzeniem pierwszego', () => {
    const plan = planBossAttack(ctx({ enraged: true }));
    const first = plan.strikes.filter((s) => s.center.y === 0);
    const second = plan.strikes.filter((s) => s.center.y === 96);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(3);
    expect(second[0]!.telegraphStartAt).toBe(first[0]!.impactAt);
    expect(second[0]!.impactAt).toBe(first[0]!.impactAt + STOKER.grate.enragedFollowMs);
  });

  it('mózg bossa zmienia zestaw rzędów co atak rusztem', () => {
    const brain = new BossBrain({ ...STOKER, pattern: [BossAttackKind.Grate], openingDelayMs: 0, restBetweenAttacksMs: 0 }, createRng(2));
    brain.activate(0);
    const sets: number[] = [];
    let now = 0;
    for (let i = 0; i < 40 && sets.length < 3; i++) {
      const d = brain.think({ self: { x: 0, y: 200 }, target: { x: 20, y: 200 }, now, hpRatio: 1, grates: rows });
      if (d.newAttack) sets.push(d.newAttack.strikes[0]!.center.y);
      now += 500;
    }
    expect(sets).toEqual([0, 96, 0]);
  });

  it('bez rusztów na arenie atak jest pustą przerwą', () => {
    expect(planBossAttack(ctx({ grates: [] })).strikes).toHaveLength(0);
  });
});

describe('Palacz: przegrzanie drzwiczek', () => {
  it('trzy smugi stref przed bossem w stronę tarczy, promień rośnie z dystansem', () => {
    const vent = STOKER.shield.overheat;
    const strikes = planOverheatVent({ x: 0, y: 0 }, 0, STOKER.radius, vent, 500);
    expect(strikes.length % 3).toBe(0);
    expect(strikes.every((s) => s.center.x > 0 && s.impactAt === 500 + vent.telegraphMs)).toBe(true);
    const middle = strikes.filter((s) => Math.abs(s.center.y) < 0.001);
    expect(middle.at(-1)!.radius).toBeGreaterThan(middle[0]!.radius);
    expect(Math.max(...strikes.map((s) => Math.hypot(s.center.x, s.center.y)))).toBeLessThanOrEqual(vent.length);
  });
});

describe('Palacz: ruszty w posadzce areny', () => {
  const floors = sampleFloors([4], 20);
  it('pasy na podłodze areny, z dala od wejść i bocznych murów, bez środkowego rzędu; zestawy na przemian', () => {
    for (const floor of floors) {
      const arena = floor.rooms[floor.bossRoomId]!;
      const grateRows = planArenaGrates(floor, arena, STOKER.arenaGrates);
      expect(grateRows.length).toBeGreaterThanOrEqual(2);
      const entrances = findRoomEntrances(floor, arena);
      const middle = arena.y + Math.floor(arena.height / 2);
      grateRows.forEach((row, i) => {
        expect(row.set).toBe(i % 2);
        for (const t of row.tiles) {
          expect(floor.tiles[t.y * floor.width + t.x]).toBe(TileType.Floor);
          expect(t.y).not.toBe(middle);
          expect(t.x).toBeGreaterThanOrEqual(arena.x + STOKER.arenaGrates.wallMargin);
          expect(t.x).toBeLessThan(arena.x + arena.width - STOKER.arenaGrates.wallMargin);
          for (const e of entrances) expect(Math.max(Math.abs(e.x - t.x), Math.abs(e.y - t.y))).toBeGreaterThan(STOKER.arenaGrates.doorClear);
        }
      });
    }
  });
});
