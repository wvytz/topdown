import { describe, expect, it } from 'vitest';
import { BARBARIAN_SHOT_HOMING } from '@/config/combatConfig';
import { pickHomingTarget, steerVelocity, type HomingConfig } from '@/systems/Homing';

const CONFIG: HomingConfig = { range: 200, coneHalfDeg: 70, turnRateDegPerSec: 480 };
const angleOf = (v: { x: number; y: number }) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

describe('pickHomingTarget', () => {
  it('wybiera cel, do którego trzeba skręcić najmniej', () => {
    const near = { x: 50, y: 40, radius: 8 };
    const ahead = { x: 150, y: 5, radius: 8 };
    expect(pickHomingTarget({ x: 0, y: 0 }, { x: 460, y: 0 }, [near, ahead], CONFIG)).toBe(ahead);
  });

  it('pomija cele za plecami i poza zasięgiem', () => {
    const behind = { x: -40, y: 0, radius: 8 };
    const far = { x: 400, y: 0, radius: 8 };
    expect(pickHomingTarget({ x: 0, y: 0 }, { x: 460, y: 0 }, [behind, far], CONFIG)).toBeNull();
  });

  it('duży cel na brzegu stożka łapie się dzięki promieniowi', () => {
    const boss = { x: 0, y: 100, radius: 50 };
    // Środek pod kątem 90° (poza stożkiem 70°), ale brzeg widać pod ok. 60°.
    expect(pickHomingTarget({ x: 0, y: 0 }, { x: 460, y: 0 }, [boss], CONFIG)).toBe(boss);
  });
});

describe('steerVelocity', () => {
  it('skręca najwyżej o turnRate × dt i zachowuje szybkość', () => {
    const v = steerVelocity({ x: 0, y: 0 }, { x: 460, y: 0 }, [{ x: 50, y: 80, radius: 8 }], CONFIG, 100);
    expect(angleOf(v)).toBeCloseTo(48, 5);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(460, 5);
  });

  it('nie przestrzeliwuje kierunku, gdy cel jest prawie na wprost', () => {
    const v = steerVelocity({ x: 0, y: 0 }, { x: 460, y: 0 }, [{ x: 100, y: 5, radius: 8 }], CONFIG, 100);
    expect(angleOf(v)).toBeCloseTo((Math.atan2(5, 100) * 180) / Math.PI, 5);
  });

  it('bez celu leci prosto', () => {
    expect(steerVelocity({ x: 0, y: 0 }, { x: 460, y: 0 }, [], CONFIG, 16)).toEqual({ x: 460, y: 0 });
  });

  it('strzał barbarzyńcy trafia Kitera z boku, który chybiłby lecąc prosto', () => {
    // Symulacja lotu w krokach 16 ms: cel 40 px obok osi strzału, 150 px przed graczem.
    const target = { x: 150, y: 40, radius: 10 };
    let pos = { x: 0, y: 0 };
    let vel = { x: 460, y: 0 };
    let hit = false;
    for (let t = 0; t < 650 && !hit; t += 16) {
      vel = steerVelocity(pos, vel, [target], BARBARIAN_SHOT_HOMING, 16);
      pos = { x: pos.x + (vel.x * 16) / 1000, y: pos.y + (vel.y * 16) / 1000 };
      hit = Math.hypot(target.x - pos.x, target.y - pos.y) <= target.radius + 4;
    }
    expect(hit).toBe(true);
  });
});
