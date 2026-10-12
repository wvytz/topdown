import { describe, expect, it } from 'vitest';
import { AttackPhase } from '@/core/combatTypes';
import { AttackCycle } from '@/systems/AttackCycle';
import { DashController } from '@/systems/DashController';
import { Timer } from '@/systems/Timer';

describe('Timer', () => {
  it('przed startem jest nieaktywny i „zakończony”', () => {
    const timer = new Timer();
    expect(timer.isActive(0)).toBe(false);
    expect(timer.progress(0)).toBe(1);
  });

  it('jest aktywny dokładnie przez zadany czas', () => {
    const timer = new Timer();
    timer.start(100, 50);
    expect(timer.isActive(100)).toBe(true);
    expect(timer.isActive(149)).toBe(true);
    expect(timer.isActive(150)).toBe(false);
    expect(timer.progress(125)).toBeCloseTo(0.5);
  });
});

describe('AttackCycle', () => {
  it('przechodzi przez fazy: zamach → odnowienie → gotowość', () => {
    const cycle = new AttackCycle(350, 1000);
    expect(cycle.phase(0)).toBe(AttackPhase.Ready);
    expect(cycle.tryStart(0)).toBe(true);
    expect(cycle.phase(100)).toBe(AttackPhase.Windup);
    expect(cycle.phase(500)).toBe(AttackPhase.Recovery);
    expect(cycle.phase(1000)).toBe(AttackPhase.Ready);
  });

  it('uderzenie („release”) następuje dokładnie raz, po zamachu', () => {
    const cycle = new AttackCycle(350, 1000);
    cycle.tryStart(0);
    expect(cycle.consumeRelease(349)).toBe(false);
    expect(cycle.consumeRelease(350)).toBe(true);
    expect(cycle.consumeRelease(360)).toBe(false);
  });

  it('nie da się zacząć nowego ataku przed końcem cooldownu', () => {
    const cycle = new AttackCycle(350, 1000);
    cycle.tryStart(0);
    expect(cycle.tryStart(999)).toBe(false);
    expect(cycle.tryStart(1000)).toBe(true);
  });

  it('bez zamachu (gracz) uderza w tej samej klatce', () => {
    const cycle = new AttackCycle(0, 320);
    expect(cycle.tryStart(0)).toBe(true);
    expect(cycle.consumeRelease(0)).toBe(true);
  });

  it('readiness rośnie od 0 do 1', () => {
    const cycle = new AttackCycle(0, 400);
    cycle.tryStart(0);
    expect(cycle.readiness(0)).toBe(0);
    expect(cycle.readiness(200)).toBeCloseTo(0.5);
    expect(cycle.readiness(400)).toBe(1);
  });
});

describe('DashController', () => {
  const config = { speed: 600, durationMs: 150, cooldownMs: 700 };

  it('trwa zadany czas i ma znormalizowaną prędkość', () => {
    const dash = new DashController(config);
    expect(dash.tryStart(0, { x: 1, y: 1 })).toBe(true);
    expect(dash.isDashing(149)).toBe(true);
    expect(dash.isDashing(150)).toBe(false);
    const v = dash.velocity();
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(600);
  });

  it('respektuje cooldown', () => {
    const dash = new DashController(config);
    dash.tryStart(0, { x: 1, y: 0 });
    expect(dash.tryStart(699, { x: 1, y: 0 })).toBe(false);
    expect(dash.tryStart(700, { x: 1, y: 0 })).toBe(true);
  });

  it('nie startuje bez kierunku', () => {
    const dash = new DashController(config);
    expect(dash.tryStart(0, { x: 0, y: 0 })).toBe(false);
    expect(dash.readiness(0)).toBe(1);
  });
});
