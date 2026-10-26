import { describe, expect, it } from 'vitest';
import { CoopLobby } from '@/systems/coopLobby';
import { KEYBOARD_MOUSE, padDevice } from '@/systems/coopDevices';

describe('ekran co-opu (etap C5)', () => {
  it('drugi gracz dostaje innego bohatera niż pierwszy', () => {
    const lobby = new CoopLobby(3, 2);
    expect(lobby.join(KEYBOARD_MOUSE, 1)).toBe(0);
    expect(lobby.join(padDevice(0), 1)).toBe(1);
    expect(lobby.all.map((s) => s.hero)).toEqual([1, 2]);
    expect(lobby.join(padDevice(1))).toBe(-1);
    expect(lobby.join(KEYBOARD_MOUSE)).toBe(-1);
  });

  it('zmiana bohatera przeskakuje bohatera partnera, w obie strony', () => {
    const lobby = new CoopLobby(3, 2);
    lobby.join(KEYBOARD_MOUSE, 0);
    lobby.join(padDevice(0), 1);
    lobby.move(0, 1);
    expect(lobby.all[0]?.hero).toBe(2);
    lobby.move(0, 1);
    expect(lobby.all[0]?.hero).toBe(0);
    lobby.move(0, -1);
    expect(lobby.all[0]?.hero).toBe(2);
  });

  it('start dopiero, gdy obaj gotowi; gotowy nie zmienia bohatera', () => {
    const lobby = new CoopLobby(3, 2);
    lobby.join(KEYBOARD_MOUSE);
    lobby.confirm(0);
    expect(lobby.canStart).toBe(false);
    lobby.move(0, 1);
    expect(lobby.all[0]?.hero).toBe(0);
    lobby.join(padDevice(0));
    lobby.confirm(1);
    expect(lobby.canStart).toBe(true);
    expect(lobby.playerDevices()).toEqual([
      { keyboard: true, mouse: true, pad: null },
      { keyboard: false, mouse: false, pad: 0 },
    ]);
  });

  it('wstecz: gotowy wraca do wyboru, niegotowy wychodzi', () => {
    const lobby = new CoopLobby(3, 2);
    lobby.join(KEYBOARD_MOUSE);
    lobby.join(padDevice(0));
    lobby.confirm(1);
    expect(lobby.back(1)).toBe('unready');
    expect(lobby.back(0)).toBe('left');
    expect(lobby.slotOf(padDevice(0))).toBe(0);
    expect(lobby.back(5)).toBeNull();
  });
});
