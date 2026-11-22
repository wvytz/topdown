import { describe, expect, it } from 'vitest';
import { TOUCH_BUTTONS, TOUCH_LABELS, TOUCH_UI_SCALE } from '@/config/touchConfig';
import { measureLine } from '@/core/pixelFont';
import { buttonAt, fitLabelUnit, followStickOrigin, placeButton, touchUiScale } from '@/systems/touchLayout';

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

describe('touchUiScale — sterowanie rośnie z ekranem (krok U12b)', () => {
  it('ekran odniesienia daje 1, a skala jest obcięta z obu stron', () => {
    expect(touchUiScale(TOUCH_UI_SCALE.referenceHeight, TOUCH_UI_SCALE)).toBe(1);
    expect(touchUiScale(200, TOUCH_UI_SCALE)).toBe(TOUCH_UI_SCALE.min);
    expect(touchUiScale(1200, TOUCH_UI_SCALE)).toBe(TOUCH_UI_SCALE.max);
  });

  it('zły rozmiar ekranu (jeszcze nie zmierzony) nie psuje układu', () => {
    expect(touchUiScale(0, TOUCH_UI_SCALE)).toBe(1);
    expect(touchUiScale(Number.NaN, TOUCH_UI_SCALE)).toBe(1);
  });

  it('skala przesuwa środek i promień przycisku od rogu ekranu', () => {
    const button = placeButton({ right: 100, bottom: 80, radius: 40 }, { width: 1000, height: 800 }, 1.5);
    expect(button).toEqual({ x: 850, y: 680, radius: 60 });
  });

  it('przyciski nie nachodzą na siebie także przy największej skali', () => {
    const screen = { width: 1300, height: 900 };
    const ids = ['attack', 'shoot', 'dash', 'interact', 'ultimate'] as const;
    for (const a of ids) for (const b of ids) {
      if (a >= b) continue;
      const p = placeButton(TOUCH_BUTTONS[a], screen, TOUCH_UI_SCALE.max);
      const q = placeButton(TOUCH_BUTTONS[b], screen, TOUCH_UI_SCALE.max);
      expect(Math.hypot(p.x - q.x, p.y - q.y), `${a} / ${b}`).toBeGreaterThanOrEqual(p.radius + q.radius);
    }
  });
});

describe('fitLabelUnit — napis mieści się w kółku', () => {
  it('krótki napis dostaje największy rozmiar, długi — mniejszy, nie mniej niż 1', () => {
    expect(fitLabelUnit([10], 46, 3)).toBe(3);
    expect(fitLabelUnit([60], 30, 3)).toBe(1);
    expect(fitLabelUnit([], 30, 3)).toBe(3);
  });

  it('wszystkie napisy przycisków walki mieszczą się w swoich kółkach (rozmiar ≥ 2 poza najdłuższymi)', () => {
    const kinds = ['melee', 'sorcery', 'archery'] as const;
    for (const kind of kinds) {
      for (const id of ['attack', 'shoot', 'ultimate'] as const) {
        const label = TOUCH_LABELS[id][kind];
        const unit = fitLabelUnit(label.split('\n').map((line) => measureLine(line)), TOUCH_BUTTONS[id].radius, id === 'attack' ? 3 : 2);
        expect(unit, `${id}/${kind}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
