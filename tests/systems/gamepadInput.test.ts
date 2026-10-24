import { describe, expect, it } from 'vitest';
import { GAMEPAD_CONFIG, PAD_AXIS, PAD_BUTTON } from '@/config/gamepadConfig';
import {
  ButtonEdges,
  MenuCommand,
  PadGameplayReader,
  PadMenuReader,
  combineMovement,
  menuCommandFromKey,
  padAimDirection,
  stickVector,
  type PadSnapshot,
} from '@/systems/gamepadInput';

/** Migawka pada: wciśnięte przyciski (wartość 1 albo podana) i wychylenia osi. */
function pad(buttons: Partial<Record<number, number>> = {}, axes: Partial<Record<number, number>> = {}): PadSnapshot {
  return {
    buttons: Array.from({ length: 17 }, (_, i) => buttons[i] ?? 0),
    axes: Array.from({ length: 4 }, (_, i) => axes[i] ?? 0),
  };
}

describe('stickVector', () => {
  it('martwa strefa zeruje drobne wychylenie', () => {
    expect(stickVector(0.1, 0.1, 0.2)).toEqual({ x: 0, y: 0 });
  });

  it('poza strefą skaluje od zera do 1 i zachowuje kierunek', () => {
    const half = stickVector(0.6, 0, 0.2);
    expect(half.x).toBeCloseTo(0.5);
    expect(half.y).toBe(0);
    const full = stickVector(0, -1, 0.2);
    expect(full.y).toBeCloseTo(-1);
  });

  it('nigdy nie przekracza długości 1 (pady potrafią dać ukos > 1)', () => {
    const v = stickVector(1, 1, 0.2);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });
});

describe('ButtonEdges', () => {
  it('pierwsza klatka tylko zapamiętuje stan — trzymany przycisk się nie liczy', () => {
    const edges = new ButtonEdges();
    expect(edges.update([true, false])).toEqual(new Set());
    expect(edges.update([true, false])).toEqual(new Set());
    expect(edges.update([false, false])).toEqual(new Set());
    expect(edges.update([true, true])).toEqual(new Set([0, 1]));
  });

  it('po resecie (pad odłączony) znów zaczyna od zapamiętania stanu', () => {
    const edges = new ButtonEdges();
    edges.update([false]);
    edges.reset();
    expect(edges.update([true])).toEqual(new Set());
  });
});

describe('PadGameplayReader', () => {
  it('bez pada nic nie zwraca', () => {
    expect(new PadGameplayReader().read(null)).toBeNull();
  });

  it('lewa gałka to ruch, krzyżak ma pierwszeństwo', () => {
    const reader = new PadGameplayReader();
    expect(reader.read(pad({}, { [PAD_AXIS.leftX]: 1 }))!.move.x).toBeCloseTo(1);
    expect(reader.read(pad({ [PAD_BUTTON.Up]: 1 }, { [PAD_AXIS.leftX]: 1 }))!.move).toEqual({ x: 0, y: -1 });
  });

  it('prawa gałka daje jednostkowy kierunek celowania, w martwej strefie null', () => {
    const reader = new PadGameplayReader();
    expect(reader.read(pad({}, { [PAD_AXIS.rightX]: 0.1 }))!.aim).toBeNull();
    const aim = reader.read(pad({}, { [PAD_AXIS.rightX]: -0.5, [PAD_AXIS.rightY]: 0.5 }))!.aim!;
    expect(Math.hypot(aim.x, aim.y)).toBeCloseTo(1);
    expect(aim.x).toBeLessThan(0);
  });

  it('spusty są analogowe: liczą się od progu', () => {
    const reader = new PadGameplayReader();
    const below = GAMEPAD_CONFIG.pressThreshold / 2;
    expect(reader.read(pad({ [PAD_BUTTON.RT]: below }))!.attack).toBe(false);
    expect(reader.read(pad({ [PAD_BUTTON.RT]: 0.5, [PAD_BUTTON.LT]: 0.5 }))).toMatchObject({ attack: true, shoot: true });
  });

  it('dash i interakcja są jednorazowe, a A trzymane przy starcie piętra nie robi dasha', () => {
    const reader = new PadGameplayReader();
    expect(reader.read(pad({ [PAD_BUTTON.A]: 1 }))!.dash).toBe(false);
    expect(reader.read(pad({ [PAD_BUTTON.A]: 1 }))!.dash).toBe(false);
    reader.read(pad());
    expect(reader.read(pad({ [PAD_BUTTON.A]: 1, [PAD_BUTTON.X]: 1 }))).toMatchObject({ dash: true, interact: true });
    expect(reader.read(pad({ [PAD_BUTTON.A]: 1, [PAD_BUTTON.X]: 1 }))).toMatchObject({ dash: false, interact: false });
  });
});

describe('padAimDirection', () => {
  const last = { x: 0, y: 1 };

  it('prawa gałka wygrywa', () => {
    expect(padAimDirection({ x: 1, y: 0 }, { x: -1, y: 0 }, last)).toEqual({ x: 1, y: 0 });
  });

  it('bez prawej gałki cel idzie za ruchem', () => {
    const dir = padAimDirection(null, { x: -0.5, y: 0 }, last);
    expect(dir).toEqual({ x: -1, y: 0 });
  });

  it('bohater stoi — zostaje ostatni kierunek', () => {
    expect(padAimDirection(null, { x: 0, y: 0 }, last)).toBe(last);
  });
});

describe('combineMovement', () => {
  it('sumuje klawiaturę i pad, ograniczając osie', () => {
    expect(combineMovement({ x: 1, y: 0 }, { x: 0.5, y: -0.5 })).toEqual({ x: 1, y: -0.5 });
  });
});

describe('menuCommandFromKey', () => {
  it('strzałki, WASD, Enter/Spacja, Esc/Backspace i X/Delete', () => {
    expect(menuCommandFromKey('ArrowUp')).toBe(MenuCommand.Up);
    expect(menuCommandFromKey('s')).toBe(MenuCommand.Down);
    expect(menuCommandFromKey('A')).toBe(MenuCommand.Left);
    expect(menuCommandFromKey('ArrowRight')).toBe(MenuCommand.Right);
    expect(menuCommandFromKey(' ')).toBe(MenuCommand.Confirm);
    expect(menuCommandFromKey('Backspace')).toBe(MenuCommand.Back);
    expect(menuCommandFromKey('Delete')).toBe(MenuCommand.Alt);
    expect(menuCommandFromKey('1')).toBeNull();
  });
});

describe('PadMenuReader', () => {
  const { repeatDelayMs, repeatIntervalMs } = GAMEPAD_CONFIG.menu;

  it('A, B, Y i Start dają komendy na zboczu', () => {
    const reader = new PadMenuReader();
    reader.read(pad(), 0);
    expect(reader.read(pad({ [PAD_BUTTON.A]: 1 }), 16)).toEqual([MenuCommand.Confirm]);
    expect(reader.read(pad({ [PAD_BUTTON.A]: 1 }), 32)).toEqual([]);
    expect(reader.read(pad({ [PAD_BUTTON.B]: 1, [PAD_BUTTON.Y]: 1, [PAD_BUTTON.Start]: 1 }), 48)).toEqual([
      MenuCommand.Back,
      MenuCommand.Alt,
      MenuCommand.Pause,
    ]);
  });

  it('przycisk trzymany przy wejściu na ekran nie działa', () => {
    const reader = new PadMenuReader();
    expect(reader.read(pad({ [PAD_BUTTON.A]: 1 }), 0)).toEqual([]);
    expect(reader.read(pad({ [PAD_BUTTON.A]: 1 }), 16)).toEqual([]);
  });

  it('kierunek: od razu, potem powtarzanie przy przytrzymaniu', () => {
    const reader = new PadMenuReader();
    reader.read(pad(), 0);
    const down = pad({ [PAD_BUTTON.Down]: 1 });
    expect(reader.read(down, 100)).toEqual([MenuCommand.Down]);
    expect(reader.read(down, 100 + repeatDelayMs - 1)).toEqual([]);
    expect(reader.read(down, 100 + repeatDelayMs)).toEqual([MenuCommand.Down]);
    expect(reader.read(down, 100 + repeatDelayMs + repeatIntervalMs)).toEqual([MenuCommand.Down]);
  });

  it('gałka działa jak krzyżak po przeważającej osi, dopiero od progu', () => {
    const reader = new PadMenuReader();
    reader.read(pad(), 0);
    expect(reader.read(pad({}, { [PAD_AXIS.leftX]: 0.3 }), 16)).toEqual([]);
    expect(reader.read(pad({}, { [PAD_AXIS.leftX]: -0.9, [PAD_AXIS.leftY]: 0.5 }), 32)).toEqual([MenuCommand.Left]);
  });

  it('kierunek trzymany przy wejściu na ekran działa dopiero po puszczeniu', () => {
    const reader = new PadMenuReader();
    const up = pad({ [PAD_BUTTON.Up]: 1 });
    expect(reader.read(up, 0)).toEqual([]);
    expect(reader.read(up, 10_000)).toEqual([]);
    reader.read(pad(), 10_016);
    expect(reader.read(up, 10_032)).toEqual([MenuCommand.Up]);
  });
});
