import { describe, expect, it } from 'vitest';
import { MENU_ORDER, MenuEntry, initialEntry, isEntryEnabled, moveCursor } from '@/systems/mainMenu';

const none = { hasAutosave: false, hasSlots: false, bestBossFloor: 0 };
const all = { hasAutosave: true, hasSlots: true, bestBossFloor: 3 };

describe('menu główne', () => {
  it('Kontynuuj i Wczytaj są aktywne tylko z zapisem, wybór piętra — po pierwszym bossie', () => {
    expect(isEntryEnabled(MenuEntry.Continue, none)).toBe(false);
    expect(isEntryEnabled(MenuEntry.Load, none)).toBe(false);
    expect(isEntryEnabled(MenuEntry.Continue, all)).toBe(true);
    expect(isEntryEnabled(MenuEntry.Load, all)).toBe(true);
    expect(isEntryEnabled(MenuEntry.FloorSelect, none)).toBe(false);
    expect(isEntryEnabled(MenuEntry.FloorSelect, all)).toBe(true);
    expect(isEntryEnabled(MenuEntry.NewTower, none)).toBe(true);
    expect(isEntryEnabled(MenuEntry.Coop, none)).toBe(true);
    expect(isEntryEnabled(MenuEntry.Coop, { ...none, coop: false })).toBe(false);
  });

  it('kursor pomija nieaktywne pozycje i zawija się', () => {
    const enabled = MENU_ORDER.map((e) => isEntryEnabled(e, none));
    const tower = MENU_ORDER.indexOf(MenuEntry.NewTower);
    const coop = MENU_ORDER.indexOf(MenuEntry.Coop);
    const arenas = MENU_ORDER.indexOf(MenuEntry.BossRush);
    const controls = MENU_ORDER.indexOf(MenuEntry.Controls);
    expect(moveCursor(enabled, tower, 1)).toBe(coop);
    expect(moveCursor(enabled, coop, 1)).toBe(arenas);
    expect(moveCursor(enabled, arenas, 1)).toBe(controls);
    expect(moveCursor(enabled, controls, 1)).toBe(tower);
    expect(moveCursor(enabled, tower, -1)).toBe(controls);
  });

  it('bez aktywnych pozycji kursor stoi', () => {
    expect(moveCursor([false, false], 1, 1)).toBe(1);
  });

  it('na starcie: tryb z adresu, potem Kontynuuj, potem nowa wspinaczka', () => {
    expect(MENU_ORDER[initialEntry(MENU_ORDER, all, null)]).toBe(MenuEntry.Continue);
    expect(MENU_ORDER[initialEntry(MENU_ORDER, none, null)]).toBe(MenuEntry.NewTower);
    expect(MENU_ORDER[initialEntry(MENU_ORDER, all, MenuEntry.BossRush)]).toBe(MenuEntry.BossRush);
    expect(MENU_ORDER[initialEntry(MENU_ORDER, none, MenuEntry.Continue)]).toBe(MenuEntry.NewTower);
  });
});
