import { describe, expect, it } from 'vitest';
import { FUNGAL_DEVOURER } from '@/config/bossConfig';
import { HERO_HURTBOX } from '@/config/combatConfig';
import { FungalTrail } from '@/systems/FungalTrail';
import { isInWebPatch, webPatchRadius } from '@/ai/bossAttacks';

const TRAIL = FUNGAL_DEVOURER.trail;

/** Boss idzie w prawo po `step` px na klatkę; zwraca płaty. */
function walk(trail: FungalTrail, frames: number, step: number, enraged = false) {
  const patches = [];
  for (let i = 0; i <= frames; i++) {
    const shot = trail.step({ x: i * step, y: 0 }, i * 16, enraged);
    if (shot) patches.push(shot);
  }
  return patches;
}

describe('ślad grzybów (krok 111)', () => {
  it('co `spacing` px drogi płat pod stopami bossa', () => {
    const patches = walk(new FungalTrail(TRAIL), 100, 2);
    expect(patches).toHaveLength(Math.floor(200 / TRAIL.spacing));
    expect(patches[0]!.to).toEqual({ x: TRAIL.spacing, y: TRAIL.offsetY });
    expect(patches[0]!.look).toBe('mushrooms');
    expect(patches[0]!.status?.poison).toEqual(TRAIL.patch.poison);
    expect(patches[0]!.expiresAt - patches[0]!.landAt).toBe(TRAIL.patch.durationMs);
  });

  it('stojący boss nie sieje; we wściekłości płaty leżą dłużej i jest ich więcej', () => {
    const trail = new FungalTrail(TRAIL);
    expect(walk(trail, 50, 0)).toHaveLength(0);
    const angry = walk(new FungalTrail(TRAIL), 100, 2, true);
    expect(angry[0]!.expiresAt - angry[0]!.landAt).toBe(TRAIL.enragedDurationMs);
    expect(trail.maxPatches(true)).toBeGreaterThan(trail.maxPatches(false));
  });

  it('skok (duże przesunięcie w klatce) i reset nie zostawiają grzybów po drodze', () => {
    const trail = new FungalTrail(TRAIL);
    trail.step({ x: 0, y: 0 }, 0, false);
    expect(trail.step({ x: 200, y: 0 }, 16, false)).toBeNull();
    trail.reset();
    expect(trail.step({ x: 500, y: 0 }, 32, false)).toBeNull();
  });

  it('płat rośnie do maxRadius; łapie ślad stóp bohatera (jak strefy z kroku 110)', () => {
    const [patch] = walk(new FungalTrail(TRAIL), 20, 2);
    const done = patch!.landAt + TRAIL.patch.spreadMs;
    expect(webPatchRadius(patch!, done)).toBe(TRAIL.patch.maxRadius);
    const edge = TRAIL.patch.maxRadius + HERO_HURTBOX.ground.radius;
    // Bohater stoi nad płatem: stopy (środek + offsetY) dotykają brzegu.
    const feetOnEdge = { x: patch!.to.x + edge - 0.5, y: patch!.to.y - HERO_HURTBOX.ground.offsetY };
    const feetOutside = { x: patch!.to.x + edge + 0.5, y: patch!.to.y - HERO_HURTBOX.ground.offsetY };
    expect(isInWebPatch(patch!, feetOnEdge, done)).toBe(true);
    expect(isInWebPatch(patch!, feetOutside, done)).toBe(false);
    expect(isInWebPatch(patch!, feetOnEdge, patch!.expiresAt)).toBe(false);
  });
});
