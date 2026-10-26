import { describe, expect, it } from 'vitest';
import { COOP_CONFIG } from '@/config/coopConfig';
import { PAD_BUTTON } from '@/config/gamepadConfig';
import { CoopJoinReader, CoopRoster, KEYBOARD_MOUSE, SOLO_DEVICES, applyJoinRequests, devicesFor, padDevice, sameDevice } from '@/systems/coopDevices';

const pad = (pressed: readonly number[] = []) => ({
  buttons: Array.from({ length: 17 }, (_, i) => (pressed.includes(i) ? 1 : 0)),
  axes: [0, 0, 0, 0],
});
const frame = (pads: { index: number; pressed?: number[] }[], keyboardJoin = false, keyboardLeave = false) => ({
  pads: pads.map(({ index, pressed }) => ({ index, snapshot: pad(pressed) })),
  keyboardJoin,
  keyboardLeave,
});
const reader = () => new CoopJoinReader({ join: COOP_CONFIG.joinButtons, leave: COOP_CONFIG.leaveButtons });

describe('coopDevices (co-op, etap C1: urządzenia graczy)', () => {
  it('solo steruje wszystkim naraz, jak przed co-opem', () => {
    expect(SOLO_DEVICES).toEqual({ keyboard: true, mouse: true, pad: 'any' });
  });

  it('w co-opie klawiatura z myszą to jedno urządzenie, pad — drugie', () => {
    expect(devicesFor(KEYBOARD_MOUSE)).toEqual({ keyboard: true, mouse: true, pad: null });
    expect(devicesFor(padDevice(1))).toEqual({ keyboard: false, mouse: false, pad: 1 });
  });

  it('rozpoznaje to samo urządzenie', () => {
    expect(sameDevice(KEYBOARD_MOUSE, { kind: 'keyboardMouse' })).toBe(true);
    expect(sameDevice(padDevice(0), padDevice(0))).toBe(true);
    expect(sameDevice(padDevice(0), padDevice(1))).toBe(false);
    expect(sameDevice(KEYBOARD_MOUSE, padDevice(0))).toBe(false);
  });

  it('pierwsze urządzenie to P1, drugie to P2', () => {
    const roster = new CoopRoster(COOP_CONFIG.maxPlayers);
    expect(roster.join(KEYBOARD_MOUSE)).toEqual({ kind: 'joined', slot: 0, device: KEYBOARD_MOUSE });
    expect(roster.join(padDevice(0))).toEqual({ kind: 'joined', slot: 1, device: padDevice(0) });
    expect(roster.isFull).toBe(true);
    expect(roster.playerDevices()).toEqual([
      { keyboard: true, mouse: true, pad: null },
      { keyboard: false, mouse: false, pad: 0 },
    ]);
  });

  it('dwa pady: każdy gracz ma swój', () => {
    const roster = new CoopRoster(2);
    roster.join(padDevice(1));
    roster.join(padDevice(0));
    expect(roster.playerDevices().map((d) => d.pad)).toEqual([1, 0]);
  });

  it('to samo urządzenie nie zajmuje dwóch miejsc, a pełna drużyna nikogo nie przyjmie', () => {
    const roster = new CoopRoster(2);
    roster.join(padDevice(0));
    expect(roster.join(padDevice(0))).toBeNull();
    roster.join(KEYBOARD_MOUSE);
    expect(roster.join(padDevice(2))).toBeNull();
    expect(roster.count).toBe(2);
  });

  it('wyjście P1 przesuwa P2 na pierwsze miejsce', () => {
    const roster = new CoopRoster(2);
    roster.join(KEYBOARD_MOUSE);
    roster.join(padDevice(0));
    expect(roster.leave(KEYBOARD_MOUSE)).toEqual({ kind: 'left', slot: 0, device: KEYBOARD_MOUSE });
    expect(roster.slotOf(padDevice(0))).toBe(0);
    expect(roster.leave(KEYBOARD_MOUSE)).toBeNull();
    expect(roster.join(KEYBOARD_MOUSE)?.slot).toBe(1);
  });

  it('dołączanie: A na padzie i Enter na klawiaturze, każde urządzenie osobno', () => {
    const r = reader();
    expect(r.read(frame([{ index: 0 }, { index: 1 }]))).toEqual([]);
    expect(r.read(frame([{ index: 0 }, { index: 1, pressed: [PAD_BUTTON.A] }], true))).toEqual([
      { action: 'join', device: KEYBOARD_MOUSE },
      { action: 'join', device: padDevice(1) },
    ]);
    // Trzymany A nie dołącza drugi raz.
    expect(r.read(frame([{ index: 0 }, { index: 1, pressed: [PAD_BUTTON.A] }]))).toEqual([]);
    expect(r.read(frame([{ index: 0, pressed: [PAD_BUTTON.B] }, { index: 1 }]))).toEqual([{ action: 'leave', device: padDevice(0) }]);
  });

  it('przycisk trzymany przy podłączeniu pada nie dołącza', () => {
    const r = reader();
    expect(r.read(frame([{ index: 2, pressed: [PAD_BUTTON.A] }]))).toEqual([]);
    expect(r.read(frame([{ index: 2 }]))).toEqual([]);
    expect(r.read(frame([{ index: 2, pressed: [PAD_BUTTON.Start] }]))).toEqual([{ action: 'join', device: padDevice(2) }]);
  });

  it('prośby zmieniają drużynę tylko wtedy, gdy mają sens', () => {
    const roster = new CoopRoster(2);
    const events = applyJoinRequests(roster, [
      { action: 'join', device: padDevice(0) },
      { action: 'join', device: padDevice(0) },
      { action: 'leave', device: KEYBOARD_MOUSE },
      { action: 'join', device: KEYBOARD_MOUSE },
    ]);
    expect(events.map((e) => [e.kind, e.slot])).toEqual([
      ['joined', 0],
      ['joined', 1],
    ]);
  });
});
