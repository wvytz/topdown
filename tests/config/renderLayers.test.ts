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

  it('mury nad postaciami: nad wszystkim z rozgrywki, pod mrokiem i napisami', () => {
    const gameplay = [RENDER_DEPTH.enemy, RENDER_DEPTH.boss, RENDER_DEPTH.player, RENDER_DEPTH.projectile, RENDER_DEPTH.slash];
    for (const depth of gameplay) expect(RENDER_DEPTH.overhead).toBeGreaterThan(depth);
    expect(RENDER_DEPTH.overhead).toBeLessThan(RENDER_DEPTH.darkness);
    expect(RENDER_DEPTH.darkness).toBeLessThan(RENDER_DEPTH.worldText);
  });
});
