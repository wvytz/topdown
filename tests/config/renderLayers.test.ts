import { describe, expect, it } from 'vitest';
import { RENDER_DEPTH } from '@/config/renderLayers';

describe('RENDER_DEPTH — kolejność rysowania', () => {
  it('tło od dołu: podłoga < nakładki < elementy < cienie < ściany < kraty', () => {
    const order = [
      RENDER_DEPTH.floorBase,
      RENDER_DEPTH.floorDecal,
      RENDER_DEPTH.floorFeature,
      RENDER_DEPTH.envShadow,
      RENDER_DEPTH.walls,
      RENDER_DEPTH.gates,
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
  });

  it('całe tło leży pod rozgrywką (telegrafy, łupy, postacie, pociski)', () => {
    const background = Math.max(RENDER_DEPTH.walls, RENDER_DEPTH.gates);
    for (const depth of [RENDER_DEPTH.telegraph, RENDER_DEPTH.coin, RENDER_DEPTH.enemy, RENDER_DEPTH.player, RENDER_DEPTH.projectile]) {
      expect(depth).toBeGreaterThan(background);
    }
  });

  it('oświetlenie: cień postaci na podłodze pod ścianami; pyłki pod mrokiem; płomienie i poświata nad mrokiem', () => {
    expect(RENDER_DEPTH.actorShadow).toBeGreaterThan(RENDER_DEPTH.envShadow);
    expect(RENDER_DEPTH.actorShadow).toBeLessThan(RENDER_DEPTH.walls);
    expect(RENDER_DEPTH.wallDecor).toBeGreaterThan(RENDER_DEPTH.walls);
    expect(RENDER_DEPTH.wallDecor).toBeLessThan(RENDER_DEPTH.telegraph);
    expect(RENDER_DEPTH.motes).toBeGreaterThan(RENDER_DEPTH.overhead);
    expect(RENDER_DEPTH.motes).toBeLessThan(RENDER_DEPTH.darkness);
    expect(RENDER_DEPTH.torchGlow).toBeGreaterThan(RENDER_DEPTH.darkness);
    expect(RENDER_DEPTH.torchFlame).toBeGreaterThan(RENDER_DEPTH.torchGlow);
    expect(RENDER_DEPTH.torchFlame).toBeLessThan(RENDER_DEPTH.worldText);
  });

  it('mury nad postaciami: nad wszystkim z rozgrywki, pod mrokiem i napisami', () => {
    const gameplay = [RENDER_DEPTH.enemy, RENDER_DEPTH.boss, RENDER_DEPTH.player, RENDER_DEPTH.projectile, RENDER_DEPTH.slash];
    for (const depth of gameplay) expect(RENDER_DEPTH.overhead).toBeGreaterThan(depth);
    expect(RENDER_DEPTH.overhead).toBeLessThan(RENDER_DEPTH.darkness);
    expect(RENDER_DEPTH.darkness).toBeLessThan(RENDER_DEPTH.worldText);
  });
});
