import { describe, expect, it } from 'vitest';
import { RoomKind } from '@/core/dungeonTypes';
import { EnemyVariant } from '@/core/combatTypes';
import { BossId } from '@/core/bossTypes';
import { ItemId } from '@/core/lootTypes';
import { createRng } from '@/core/random';
import { AMBUSH_SCENARIOS, AMBUSH_VARIANTS } from '@/config/ambushConfig';
import { ENEMY_VARIANTS } from '@/config/combatConfig';
import { ENEMY_VISUALS } from '@/config/spriteConfig';
import { bossById } from '@/config/bossConfig';
import { AmbushPhase, AmbushState } from '@/systems/Ambush';
import {
  AmbushVariant,
  BossBoon,
  HauntPhase,
  HauntState,
  boonFor,
  dartTarget,
  edgeArrowPoints,
  farthestCorner,
  pathLength,
  pickAmbushVariant,
  pickBaitTile,
  pointAlongPath,
  stormScenario,
} from '@/systems/AmbushVariants';
import { empowerBossDefinition } from '@/systems/BossEmpower';

const room = { id: 0, x: 2, y: 2, width: 9, height: 8, kind: RoomKind.Ambush };

describe('wersje zasadzki (krok 183)', () => {
  it('losuje wszystkie trzy wersje mniej więcej po równo; bez drogi do areny — bez Uciekiniera', () => {
    const counts = { storm: 0, flight: 0, haunt: 0 };
    for (let seed = 0; seed < 600; seed++) counts[pickAmbushVariant(AMBUSH_VARIANTS, createRng(seed), true)]++;
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(140);
    for (let seed = 0; seed < 200; seed++) expect(pickAmbushVariant(AMBUSH_VARIANTS, createRng(seed), false)).not.toBe(AmbushVariant.Flight);
  });

  it('przynęta w różnych miejscach pokoju, z dala od krawędzi i wejść', () => {
    const door = { x: 2, y: 5 };
    const spots = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const t = pickBaitTile(room, [door], AMBUSH_VARIANTS.baitMargin, AMBUSH_VARIANTS.baitEntranceGap, createRng(seed));
      expect(t.x).toBeGreaterThanOrEqual(room.x + 1);
      expect(t.x).toBeLessThanOrEqual(room.x + room.width - 2);
      expect(t.y).toBeGreaterThanOrEqual(room.y + 1);
      expect(t.y).toBeLessThanOrEqual(room.y + room.height - 2);
      expect(Math.max(Math.abs(t.x - door.x), Math.abs(t.y - door.y))).toBeGreaterThan(AMBUSH_VARIANTS.baitEntranceGap);
      spots.add(`${t.x},${t.y}`);
    }
    expect(spots.size).toBeGreaterThan(10);
  });

  it('Butla dżina: fale liczniejsze i kaskadowe — następna rusza, zanim poprzednia padnie', () => {
    const scenario = stormScenario(AMBUSH_SCENARIOS[0]!, AMBUSH_VARIANTS.storm.extraGhosts);
    expect(scenario.waves[0]!.ghosts).toBe(AMBUSH_SCENARIOS[0]!.waves[0]!.ghosts + AMBUSH_VARIANTS.storm.extraGhosts);
    const { cascadeMs } = AMBUSH_VARIANTS.storm;
    const state = new AmbushState({ waves: [3, 3, 3], waveDelayMs: 1000, cascadeMs });
    const alive = { playerInside: true, playerDead: false, aliveInWave: 5 };
    expect(state.update(alive, 0)?.kind).toBe('seal');
    expect(state.update(alive, 1000)).toMatchObject({ kind: 'wave', index: 0 });
    expect(state.update(alive, 1000 + cascadeMs - 1)).toBeNull();
    expect(state.update(alive, 1000 + cascadeMs)).toMatchObject({ kind: 'wave', index: 1 });
    // Wszyscy wybici — następna fala od razu, bez przerwy.
    expect(state.update({ ...alive, aliveInWave: 0 }, 1000 + cascadeMs + 10)).toMatchObject({ kind: 'wave', index: 2 });
    expect(state.update(alive, 9000)).toBeNull();
    expect(state.update({ ...alive, aliveInWave: 0 }, 9100)?.kind).toBe('clear');
    expect(state.phase).toBe(AmbushPhase.Cleared);
  });

  it('Uciekinier: każdy przedmiot puli ma wzmocnienie bossa; boss rośnie w swojej statystyce', () => {
    for (const id of Object.values(ItemId)) expect(boonFor(id, AMBUSH_VARIANTS.flight).label.length).toBeGreaterThan(0);
    expect(boonFor(ItemId.Heart, AMBUSH_VARIANTS.flight).boon).toBe(BossBoon.Vitality);
    expect(boonFor(ItemId.Boots, AMBUSH_VARIANTS.flight).boon).toBe(BossBoon.Swiftness);
    expect(boonFor(ItemId.Blade, AMBUSH_VARIANTS.flight).boon).toBe(BossBoon.Might);
    const boss = bossById(BossId.FloorGuardian);
    const tough = empowerBossDefinition(boss, AMBUSH_VARIANTS.flight.boons[BossBoon.Vitality]);
    expect(tough.maxHp).toBeGreaterThan(boss.maxHp);
    const fast = empowerBossDefinition(boss, AMBUSH_VARIANTS.flight.boons[BossBoon.Swiftness]);
    expect(fast.moveSpeed).toBeGreaterThan(boss.moveSpeed);
    expect(fast.restBetweenAttacksMs).toBeLessThan(boss.restBetweenAttacksMs);
    const strong = empowerBossDefinition(boss, AMBUSH_VARIANTS.flight.boons[BossBoon.Might]);
    expect(strong.slam!.damage).toBeGreaterThan(boss.slam!.damage);
    expect(strong.maxHp).toBe(boss.maxHp);
  });

  it('droga uciekiniera: punkt na łamanej', () => {
    const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(pathLength(path)).toBe(20);
    expect(pointAlongPath(path, 5)).toEqual({ x: 5, y: 0 });
    expect(pointAlongPath(path, 15)).toEqual({ x: 10, y: 5 });
    expect(pointAlongPath(path, 99)).toEqual({ x: 10, y: 10 });
  });

  it('Zaduch: mrok → salwy co odstęp → wstęga po ostatniej → wielki duch → koniec', () => {
    const cfg = AMBUSH_VARIANTS.haunt;
    const state = new HauntState(cfg);
    const input = { playerInside: true, playerDead: false, arrowsAlive: 2, giantAlive: false };
    expect(state.update(input, 0)?.kind).toBe('seal');
    expect(state.update(input, cfg.darkenMs - 1)).toBeNull();
    let t = cfg.darkenMs;
    for (let i = 0; i < cfg.volleys.length; i++) {
      expect(state.update(input, t)).toEqual({ kind: 'volley', index: i, count: cfg.volleys[i] });
      t += cfg.volleyGapMs;
    }
    // Strzały jeszcze lecą — wstęga czeka.
    expect(state.update(input, t)).toBeNull();
    expect(state.update({ ...input, arrowsAlive: 0 }, t)?.kind).toBe('ribbon');
    expect(state.update({ ...input, giantAlive: true }, t + cfg.ribbonMs)?.kind).toBe('giant');
    expect(state.update({ ...input, arrowsAlive: 0, giantAlive: true }, t + 9000)).toBeNull();
    expect(state.update({ ...input, arrowsAlive: 0, giantAlive: false }, t + 9100)?.kind).toBe('clear');
    expect(state.phase).toBe(HauntPhase.Cleared);
  });

  it('strzały na brzegu kręgu, w pokoju; lecą przez bohatera; wielki duch w najdalszym rogu', () => {
    const bounds = { left: 0, top: 0, right: 200, bottom: 200 };
    const points = edgeArrowPoints({ x: 100, y: 100 }, 84, 4, bounds, createRng(5));
    expect(points).toHaveLength(4);
    for (const p of points) expect(Math.hypot(p.x - 100, p.y - 100)).toBeCloseTo(84, 0);
    const clamped = edgeArrowPoints({ x: 10, y: 10 }, 84, 6, bounds, createRng(5));
    for (const p of clamped) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
    expect(dartTarget({ x: 0, y: 0 }, { x: 10, y: 0 }, 20)).toEqual({ x: 30, y: 0 });
    expect(farthestCorner(room, { x: 3, y: 3 })).toEqual({ x: room.x + room.width - 2, y: room.y + room.height - 2 });
  });

  it('wielki duch ma własny arkusz i jest upiorem (przenika, świeci nad mrokiem)', () => {
    expect(ENEMY_VARIANTS[EnemyVariant.GreatGhost].phasing).toBeDefined();
    expect(ENEMY_VISUALS[EnemyVariant.GreatGhost].sheet).toBe('greatGhost');
    expect(ENEMY_VISUALS[EnemyVariant.GreatGhost].aboveDarkness).toBe(true);
  });
});
