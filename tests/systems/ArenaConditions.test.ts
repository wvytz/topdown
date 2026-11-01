import { describe, expect, it } from 'vitest';
import { ArenaSide } from '@/core/arenaConditionTypes';
import type { AreaStrike, BossAttackPlan, ThrownObject } from '@/core/bossTypes';
import { BossAttackKind } from '@/core/bossTypes';
import type { TilePoint } from '@/core/dungeonTypes';
import { MIRROR_HALL_ARENA, STORK_GARDEN_ARENA } from '@/config/arenaConditionsConfig';
import { adjustStorkFlight, collapseOrder, keepsReachable, mirrorExit, planHedge, rubbleForPhase } from '@/systems/ArenaCover';
import { crackRadiusFor, fallDamage, landingTile, TerracePlates, windDirection } from '@/systems/Terrace';
import { isWet, liveLanes, planWetLane, shouldBossSlide, spillPuddle, sweepFront } from '@/systems/WetFloor';

const WET = MIRROR_HALL_ARENA.wetFloor!;
const TERRACE = STORK_GARDEN_ARENA.terrace!;
const HEDGES = STORK_GARDEN_ARENA.hedges!;
const key = (t: TilePoint): string => `${t.x},${t.y}`;

describe('mokra posadzka (krok 160, A1)', () => {
  const arena = { left: 0, top: 0, right: 320, bottom: 320 };

  it('pas w rzędzie bohatera, przyciśnięty do areny', () => {
    const lane = planWetLane(arena, 150, 32, 0, true, WET);
    expect(lane.bottom - lane.top).toBe(64);
    expect(lane.top).toBeLessThanOrEqual(150);
    expect(lane.bottom).toBeGreaterThan(150);
    const edge = planWetLane(arena, 315, 32, 0, true, WET);
    expect(edge.bottom).toBe(320);
  });

  it('mokre jest tylko to, co mop już umył, i tylko do wyschnięcia', () => {
    const lane = planWetLane(arena, 150, 32, 1000, true, WET);
    const mid = 1000 + WET.sweepMs / 2;
    expect(sweepFront(lane, mid)).toBeCloseTo(160);
    expect(isWet({ x: 100, y: 150 }, [lane], [], mid)).toBe(true);
    expect(isWet({ x: 250, y: 150 }, [lane], [], mid)).toBe(false);
    expect(isWet({ x: 250, y: 150 }, [lane], [], 1000 + WET.sweepMs + 10)).toBe(true);
    expect(isWet({ x: 250, y: 150 }, [lane], [], lane.wetUntil + 1)).toBe(false);
    expect(liveLanes([lane], lane.goneAt + 1, 2)).toHaveLength(0);
  });

  it('kałuża z wiadra rozlewa się od atakującego', () => {
    const puddle = spillPuddle({ x: 100, y: 100 }, { x: 60, y: 100 }, 0, WET);
    expect(puddle.center.x).toBeGreaterThan(100);
    expect(isWet({ x: puddle.center.x, y: 100 }, [], [puddle], 10)).toBe(true);
    expect(isWet({ x: puddle.center.x, y: 100 }, [], [puddle], WET.buckets.puddleMs + 1)).toBe(false);
  });

  it('ślizga się szarża, nie chód, i nie częściej niż co cooldown', () => {
    const slide = WET.bossSlide;
    expect(shouldBossSlide(150, true, 10000, -Infinity, slide)).toBe(true);
    expect(shouldBossSlide(78, true, 10000, -Infinity, slide)).toBe(false);
    expect(shouldBossSlide(150, false, 10000, -Infinity, slide)).toBe(false);
    expect(shouldBossSlide(150, true, 10000, 10000 - slide.cooldownMs + 1, slide)).toBe(false);
  });
});

describe('komnata się sypie i lustra (A3, A2)', () => {
  it('faza 1 wali wschód, faza 2 resztę; fala od środka', () => {
    const rubble = [
      { x: 9, y: 3, phase: 1 },
      { x: 1, y: 3, phase: 2 },
    ];
    expect(rubbleForPhase(rubble, 0)).toHaveLength(0);
    expect(rubbleForPhase(rubble, 1)).toEqual([rubble[0]]);
    expect(rubbleForPhase(rubble, 2)).toHaveLength(2);
    const order = collapseOrder([{ x: 9, y: 0 }, { x: 9, y: 5 }], { x: 5, y: 5 }, 70);
    expect(order[0]!.tile).toEqual({ x: 9, y: 5 });
    expect(order[1]!.delayMs).toBe(70);
  });

  it('wyjście z lustra: najpierw przed nim', () => {
    expect(mirrorExit({ x: 4, y: 4 }, () => true)).toEqual({ x: 4, y: 5 });
    expect(mirrorExit({ x: 4, y: 4 }, (t) => t.y !== 5)).toEqual({ x: 3, y: 4 });
    expect(mirrorExit({ x: 4, y: 4 }, () => false)).toBeNull();
  });
});

describe('taras (krok 160, B3)', () => {
  const allowed = new Set<string>();
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) allowed.add(key({ x, y }));

  it('płyta pęka, po crackMs jest dziurą; limit dziur; po walce zarasta', () => {
    const plates = new TerracePlates(allowed, 100, TERRACE);
    expect(plates.crack({ x: 3, y: 3 }, 0)).toBe(true);
    expect(plates.crack({ x: 3, y: 3 }, 0)).toBe(false);
    expect(plates.isCracking({ x: 3, y: 3 }, 500)).toBe(true);
    expect(plates.isHole({ x: 3, y: 3 }, 500)).toBe(false);
    expect(plates.isHole({ x: 3, y: 3 }, TERRACE.crackMs)).toBe(true);
    expect(plates.crack({ x: 20, y: 20 }, 0)).toBe(false);
    plates.crackAround({ x: 5, y: 5 }, 3, 0);
    expect(plates.all.length).toBe(Math.floor(100 * TERRACE.maxHoleFraction));
    plates.patch();
    expect(plates.isHole({ x: 3, y: 3 }, 99999)).toBe(false);
  });

  it('lądowanie po upadku na najbliższej bezpiecznej płycie; obrażenia to część HP', () => {
    expect(landingTile({ x: 3, y: 3 }, (t) => t.x >= 5)).toEqual({ x: 5, y: 1 });
    expect(fallDamage(100, TERRACE)).toBe(15);
    expect(windDirection(ArenaSide.South)).toEqual({ x: 0, y: 1 });
  });

  it('pikowanie łamie jedną płytę, lądowanie kilka, reszta nic', () => {
    expect(crackRadiusFor('dive', 30, TERRACE)).toBe(0);
    expect(crackRadiusFor(undefined, 60, TERRACE)).toBe(TERRACE.leapCrackRadiusTiles);
    expect(crackRadiusFor('whirl', 70, TERRACE)).toBeNull();
    expect(crackRadiusFor('embers', 14, TERRACE)).toBeNull();
  });
});

describe('żywopłot i gniazda (B2, B1)', () => {
  const open = (t: TilePoint): boolean => t.x >= 0 && t.y >= 0 && t.x < 11 && t.y < 11;

  it('odcinek w poprzek drogi wiedźma → bohater, w połowie drogi', () => {
    const tiles = planHedge({ x: 1, y: 5 }, [{ x: 9, y: 5 }], { x: 9, y: 5 }, HEDGES, open, open)!;
    expect(tiles).toHaveLength(3);
    expect(new Set(tiles.map((t) => t.x)).size).toBe(1);
    expect(tiles[0]!.x).toBe(5);
  });

  it('wiedźma blisko (3 kafle): żywopłot za plecami albo z boku bohatera, z dala od ciał', () => {
    const bodies = [{ x: 4, y: 5 }, { x: 7, y: 5 }];
    const free = (t: TilePoint): boolean => open(t) && bodies.every((b) => Math.max(Math.abs(b.x - t.x), Math.abs(b.y - t.y)) > 1);
    const tiles = planHedge({ x: 4, y: 5 }, [{ x: 7, y: 5 }], { x: 7, y: 5 }, HEDGES, free, open)!;
    expect(tiles).toHaveLength(3);
    expect(tiles.every(free)).toBe(true);
  });

  it('nigdy nie odcina bohatera od wiedźmy', () => {
    // Korytarz szerokości 3 — odcinek 3 kafli zamknąłby przejście.
    const corridor = (t: TilePoint): boolean => t.x >= 0 && t.x < 11 && t.y >= 4 && t.y <= 6;
    expect(planHedge({ x: 1, y: 5 }, [{ x: 9, y: 5 }], { x: 9, y: 5 }, HEDGES, corridor, corridor)).toBeNull();
    expect(keepsReachable([{ x: 9, y: 5 }], { x: 1, y: 5 }, [{ x: 5, y: 4 }, { x: 5, y: 5 }], corridor)).toBe(true);
  });

  it('klucz bocianów: mniej pasów bez gniazd, pas kończy się na słupie', () => {
    const lane = (y: number): AreaStrike[] =>
      [0, 1, 2, 3, 4].map((i) => ({ center: { x: 16 + i * 32, y }, radius: 14, telegraphStartAt: 0, impactAt: 100 + i * 10, damage: 1, knockback: 0 }));
    const storks: ThrownObject[] = [80, 144, 208].map((y) => ({ look: 'stork', from: { x: 0, y }, to: { x: 160, y }, launchAt: 100, landAt: 150 }));
    const plan: BossAttackPlan = {
      kind: BossAttackKind.StorkFlight,
      strikes: [...lane(80), ...lane(144), ...lane(208)],
      bursts: [],
      spawns: [],
      webs: [],
      leap: null,
      throws: storks,
      endsAt: 500,
    };
    const two = adjustStorkFlight(plan, 2, [], 32);
    expect(two.throws).toHaveLength(2);
    expect(two.strikes.some((s) => s.center.y === 144)).toBe(true);
    // Słup w środkowym pasie na 3. strefie (x 80, y 144 → kafel 2,4).
    const covered = adjustStorkFlight(plan, 3, [{ x: 2, y: 4 }], 32);
    expect(covered.strikes.filter((s) => s.center.y === 144)).toHaveLength(2);
    expect(covered.throws.find((t) => t.from.y === 144)!.to).toEqual({ x: 80, y: 144 });
    expect(adjustStorkFlight({ ...plan, kind: BossAttackKind.BirdDive }, 1, [], 32)).toEqual({ ...plan, kind: BossAttackKind.BirdDive });
  });
});
