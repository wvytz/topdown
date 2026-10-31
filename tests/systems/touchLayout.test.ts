import { describe, expect, it } from 'vitest';
import { TOUCH_BUTTONS } from '@/config/touchConfig';
import { buttonAt, followStickOrigin, placeButton } from '@/systems/touchLayout';

describe('placeButton — przycisk od prawego dolnego rogu ekranu', () => {
  it('liczy środek od krawędzi ekranu, nie płótna', () => {
    expect(placeButton({ right: 90, bottom: 80, radius: 44 }, { width: 915, height: 412 })).toEqual({ x: 825, y: 332, radius: 44 });
  });

  it('duże kółko ataku mieści się na ekranie małego telefonu (640×360)', () => {
    const attack = placeButton(TOUCH_BUTTONS.attack, { width: 640, height: 360 });
    expect(attack.x + attack.radius).toBeLessThanOrEqual(640);
    expect(attack.y + attack.radius).toBeLessThanOrEqual(360);
  });

  it('przyciski walki nie nachodzą na siebie', () => {
    const screen = { width: 915, height: 412 };
    const ids = ['attack', 'shoot', 'dash', 'interact', 'ultimate'] as const;
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) continue;
        const p = placeButton(TOUCH_BUTTONS[a], screen);
        const q = placeButton(TOUCH_BUTTONS[b], screen);
        expect(Math.hypot(p.x - q.x, p.y - q.y), `${a} / ${b}`).toBeGreaterThanOrEqual(p.radius + q.radius);
      }
    }
  });
});

describe('buttonAt — przycisk pod kciukiem', () => {
  const buttons = { big: { x: 100, y: 100, radius: 40 }, small: { x: 160, y: 100, radius: 20 } };

  it('trafienie obok rysunku, ale w zapasie strefy, liczy się', () => {
    expect(buttonAt(buttons, { x: 100, y: 145 }, 1.2)).toBe('big');
    expect(buttonAt(buttons, { x: 100, y: 160 }, 1.2)).toBeNull();
  });

  it('w części wspólnej stref wygrywa bliższy środek', () => {
    expect(buttonAt(buttons, { x: 141, y: 100 }, 1.2)).toBe('small');
  });

  it('wyłączony przycisk nie łapie dotyku', () => {
    expect(buttonAt(buttons, { x: 160, y: 100 }, 1.2, (id) => id !== 'small')).toBeNull();
  });
});

describe('followStickOrigin — gałka idzie za kciukiem', () => {
  it('w promieniu środek stoi', () => {
    const origin = { x: 0, y: 0 };
    expect(followStickOrigin(origin, { x: 30, y: 0 }, 48)).toBe(origin);
  });

  it('poza promieniem środek dociąga tak, że kciuk jest na brzegu', () => {
    const next = followStickOrigin({ x: 0, y: 0 }, { x: 100, y: 0 }, 48);
    expect(next).toEqual({ x: 52, y: 0 });
  });

  it('po odjechaniu daleko zawrócenie zmienia kierunek po drodze krótszej niż średnica, nie przez cały ekran', () => {
    const origin = followStickOrigin({ x: 0, y: 0 }, { x: 200, y: 0 }, 48);
    expect(origin.x).toBeCloseTo(152);
    // Kciuk cofa się o 60 px (do 140): jest już po lewej stronie środka — bohater idzie w lewo.
    expect(140 - origin.x).toBeLessThan(0);
  });
});
