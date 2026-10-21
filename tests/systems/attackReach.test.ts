import { describe, expect, it } from 'vitest';
import { PLAYER_COMBAT } from '@/config/combatConfig';
import type { MeleeTarget } from '@/systems/MeleeResolver';
import { resolveMeleeSwing, swingReaches } from '@/systems/MeleeResolver';
import { beamReaches } from '@/systems/Sorcery';
import { shotTouches } from '@/systems/ShotResolver';

/** Cel, który liczy otrzymane ciosy — predykaty zasięgu nie mogą go ranić. */
function target(x: number, y: number, radius = 10): MeleeTarget & { hits: number } {
  return {
    x,
    y,
    radius,
    hits: 0,
    takeHit() {
      this.hits += 1;
      return { died: false, damage: 1 } as never;
    },
  };
}

// Predykaty zasięgu (poprawka komunikatu „Wejdź na arenę!”): napis tylko wtedy, gdy atak naprawdę sięga bossa.
describe('zasięg ataku bez obrażeń', () => {
  const swing = { origin: { x: 0, y: 0 }, angle: 0, combat: PLAYER_COMBAT, now: 0 };

  it('cios: cel przed graczem w zasięgu, cel daleko poza nim', () => {
    const near = target(PLAYER_COMBAT.meleeRange / 2, 0);
    const far = target(PLAYER_COMBAT.meleeRange * 10, 0);
    expect(swingReaches(swing, near)).toBe(true);
    expect(swingReaches(swing, far)).toBe(false);
    expect(near.hits).toBe(0);
    // Zgodność z właściwym rozstrzygnięciem ciosu.
    expect(resolveMeleeSwing(swing, [near, far]).hit).toEqual([near]);
  });

  it('promień: dotyka celu przy odcinku, nie dotyka odległego', () => {
    const beam = { from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, halfWidth: 4, damage: 1, knockback: 0, now: 0, source: { x: 0, y: 0 } };
    expect(beamReaches(beam, target(50, 12))).toBe(true);
    expect(beamReaches(beam, target(50, 40))).toBe(false);
  });

  it('pocisk: styka się z bliskim celem, pomija już trafiony', () => {
    const hitTarget = target(5, 0);
    const shot = { position: { x: 0, y: 0 }, velocity: { x: 1, y: 0 }, radius: 3, origin: { x: 0, y: 0 }, damage: 1, knockback: 0, now: 0 };
    expect(shotTouches(shot, hitTarget)).toBe(true);
    expect(shotTouches(shot, target(200, 0))).toBe(false);
    expect(shotTouches({ ...shot, ignore: new Set([hitTarget]) }, hitTarget)).toBe(false);
  });
});
