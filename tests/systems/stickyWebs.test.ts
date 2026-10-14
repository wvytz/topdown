import { describe, expect, it } from 'vitest';
import { BIOMES, BiomeId } from '@/config/biomeConfig';
import { PLAYER_BASE_STATS, TILE_SIZE } from '@/config/gameConfig';
import { PLAYER_STATUS_RESISTANCE } from '@/config/combatConfig';
import { StatusEffects } from '@/systems/StatusEffects';
import { isInStickyWeb, webGap } from '@/systems/StickyWebs';
import type { StickyWeb } from '@/systems/StickyWebs';

const CONFIG = BIOMES[BiomeId.SpiderLair].stickyWebs!;
const FRAME = 16;

describe('Lepkie pajęczyny — strefa i spowolnienie', () => {
  const webs: StickyWeb[] = [
    { tile: { x: 2, y: 3 }, size: 1 },
    { tile: { x: 10, y: 10 }, size: 2 },
  ];

  it('punkt w pajęczynie 1×1 i 2×2 (granice kafli), poza nią — nie', () => {
    expect(isInStickyWeb(webs, { x: 2 * TILE_SIZE, y: 3 * TILE_SIZE }, TILE_SIZE)).toBe(true);
    expect(isInStickyWeb(webs, { x: 3 * TILE_SIZE - 0.1, y: 4 * TILE_SIZE - 0.1 }, TILE_SIZE)).toBe(true);
    expect(isInStickyWeb(webs, { x: 3 * TILE_SIZE, y: 3 * TILE_SIZE }, TILE_SIZE)).toBe(false);
    expect(isInStickyWeb(webs, { x: 11.9 * TILE_SIZE, y: 11.9 * TILE_SIZE }, TILE_SIZE)).toBe(true);
    expect(isInStickyWeb(webs, { x: 12 * TILE_SIZE, y: 11 * TILE_SIZE }, TILE_SIZE)).toBe(false);
  });

  it('przerwa między kwadratami: styk = 0, jeden kafel odstępu = 1, po skosie liczy się większa oś', () => {
    const a: StickyWeb = { tile: { x: 0, y: 0 }, size: 2 };
    expect(webGap(a, { tile: { x: 2, y: 0 }, size: 1 })).toBe(0);
    expect(webGap(a, { tile: { x: 3, y: 1 }, size: 1 })).toBe(1);
    expect(webGap(a, { tile: { x: 4, y: 5 }, size: 2 })).toBe(3);
    expect(webGap(a, { tile: { x: 1, y: 1 }, size: 2 })).toBe(0);
  });

  it('spowolnienie odnawiane co klatkę trwa w pajęczynie i jeszcze durationMs po wyjściu', () => {
    const status = new StatusEffects(PLAYER_STATUS_RESISTANCE);
    for (let now = 0; now <= 2000; now += FRAME) status.apply({ slow: CONFIG.slow }, now);
    expect(status.speedMultiplier(2000)).toBeCloseTo(1 - CONFIG.slow.pct);
    expect(status.isSlowed(2000 + CONFIG.slow.durationMs - 1)).toBe(true);
    expect(status.isSlowed(2000 + CONFIG.slow.durationMs)).toBe(false);
  });

  it('spowalnia, ale nie przykleja — przejście przez pajęczynę 2×2 trwa krócej niż sekunda', () => {
    expect(CONFIG.slow.pct).toBeLessThan(1);
    const speed = PLAYER_BASE_STATS.moveSpeed * (1 - CONFIG.slow.pct);
    expect((2 * TILE_SIZE) / speed).toBeLessThan(1);
  });
});
