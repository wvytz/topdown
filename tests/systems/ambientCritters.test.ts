import { describe, expect, it } from 'vitest';
import { DEN_AMBIENT, INFERNAL_AMBIENT } from '@/config/ambientConfig';
import { ScuttlePhase, canSpeed, initialCan, initialScuttler, stepCan, stepScuttler } from '@/systems/AmbientCritters';
import type { AmbientThreat } from '@/systems/AmbientLife';

const BEETLE = INFERNAL_AMBIENT.beetles.scuttle;
const ROACH = DEN_AMBIENT.roaches.scuttle;
const CANS = DEN_AMBIENT.cans;
const ROOM = { left: 0, top: 0, right: 320, bottom: 320 };
const at = (x: number, y: number, from: { x: number; y: number }, dashing = false): AmbientThreat => ({
  x: from.x,
  y: from.y,
  distance: Math.hypot(from.x - x, from.y - y),
  dashing,
});

describe('żywe otoczenie — chrząszcze i karaluchy (krok 157)', () => {
  it('stoi, dopóki bohater nie podejdzie; potem ucieka od niego i po chwili przystaje', () => {
    let s = initialScuttler(160, 160);
    expect(stepScuttler(s, 0, 50, at(160, 160, { x: 160 - BEETLE.fleeRadius - 5, y: 160 }), ROOM, BEETLE).event).toBeNull();
    const hit = stepScuttler(s, 0, 50, at(160, 160, { x: 140, y: 160 }), ROOM, BEETLE);
    expect(hit.event).toBe('scatter');
    s = hit.state;
    expect(s.phase).toBe(ScuttlePhase.Run);
    for (let t = 50; t <= 400; t += 50) s = stepScuttler(s, t, 50, null, ROOM, BEETLE).state;
    expect(s.x).toBeGreaterThan(170); // biegnie w prawo, od bohatera
    for (let t = 450; t <= BEETLE.runMs + 100; t += 50) s = stepScuttler(s, t, 50, null, ROOM, BEETLE).state;
    expect(s.phase).toBe(ScuttlePhase.Idle);
  });

  it('dash płoszy z dalszej odległości', () => {
    const threat = at(160, 160, { x: 160 - BEETLE.fleeRadius - 10, y: 160 }, true);
    expect(stepScuttler(initialScuttler(160, 160), 0, 50, threat, ROOM, BEETLE).event).toBe('scatter');
  });

  it('karaluch chowa się w szparze pod murem, chrząszcz odbija się i zostaje w pokoju', () => {
    let roach = stepScuttler(initialScuttler(300, 160), 0, 50, at(300, 160, { x: 290, y: 160 }), ROOM, ROACH).state;
    let hid = false;
    for (let t = 50; t < 2000 && !hid; t += 50) {
      const step = stepScuttler(roach, t, 50, null, ROOM, ROACH);
      roach = step.state;
      hid = step.event === 'hide';
    }
    expect(hid).toBe(true);
    expect(roach.phase).toBe(ScuttlePhase.Hidden);
    let beetle = stepScuttler(initialScuttler(290, 160), 0, 50, at(290, 160, { x: 280, y: 160 }), ROOM, BEETLE).state;
    for (let t = 50; t < 2000; t += 50) beetle = stepScuttler(beetle, t, 50, null, ROOM, BEETLE).state;
    expect(beetle.phase).toBe(ScuttlePhase.Idle);
    expect(beetle.x).toBeLessThanOrEqual(ROOM.right - BEETLE.wallMarginPx);
  });
});

describe('żywe otoczenie — puszki (krok 157)', () => {
  const open = () => false;
  it('wejście bohatera w promień kopie puszkę od niego; stanie obok nie kopie w kółko', () => {
    const kick = stepCan(initialCan(100, 100), 16, at(100, 100, { x: 94, y: 100 }), open, CANS);
    expect(kick.event).toBe('kick');
    expect(kick.state.vx).toBeGreaterThan(0);
    let s = kick.state;
    let kicks = 0;
    for (let i = 0; i < 100; i++) {
      const step = stepCan(s, 16, at(s.x, s.y, { x: s.x - 6, y: s.y }), open, CANS);
      if (step.event === 'kick') kicks++;
      s = step.state;
    }
    expect(kicks).toBe(0);
  });

  it('dash kopie mocniej, puszka hamuje i staje', () => {
    const walk = stepCan(initialCan(100, 100), 16, at(100, 100, { x: 94, y: 100 }), open, CANS).state;
    const dash = stepCan(initialCan(100, 100), 16, at(100, 100, { x: 94, y: 100 }, true), open, CANS).state;
    expect(canSpeed(dash)).toBeGreaterThan(canSpeed(walk) * 2);
    let s = dash;
    for (let i = 0; i < 400; i++) s = stepCan(s, 16, null, open, CANS).state;
    expect(canSpeed(s)).toBe(0);
    expect(s.x).toBeGreaterThan(150);
    expect(s.rolled).toBeGreaterThan(40);
  });

  it('odbija się od muru z brzękiem i traci prędkość', () => {
    const wall = (x: number) => x >= 120;
    let s = stepCan(initialCan(110, 100), 16, at(110, 100, { x: 104, y: 100 }, true), wall, CANS).state;
    let clinks = 0;
    for (let i = 0; i < 20; i++) {
      const step = stepCan(s, 16, null, wall, CANS);
      if (step.event === 'clink') clinks++;
      s = step.state;
    }
    expect(clinks).toBe(1);
    expect(s.vx).toBeLessThan(0);
    expect(s.x).toBeLessThan(120);
  });
});
