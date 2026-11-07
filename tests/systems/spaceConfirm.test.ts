import { describe, expect, it } from 'vitest';
import { isMenuEntrySpaceSafe, isPauseItemSpaceSafe, spaceConfirms } from '@/systems/spaceConfirm';
import { MenuEntry } from '@/systems/mainMenu';
import { PauseItem } from '@/systems/pauseMenu';
import { SPACE_CONFIRM_CONFIG } from '@/config/menuConfig';

const config = { openGuardMs: 400 };

describe('spaceConfirm (krok 161)', () => {
  it('świeża spacja po otwarciu ekranu wybiera bezpieczną pozycję', () => {
    expect(spaceConfirms({ key: ' ', repeat: false, sinceOpenMs: 500 }, true, config)).toBe(true);
  });

  it('spacja z biegu (zaraz po otwarciu) i autopowtórzenie nic nie wybierają', () => {
    expect(spaceConfirms({ key: ' ', repeat: false, sinceOpenMs: 100 }, true, config)).toBe(false);
    expect(spaceConfirms({ key: ' ', repeat: true, sinceOpenMs: 900 }, true, config)).toBe(false);
  });

  it('niebezpieczna pozycja i inny klawisz — nie', () => {
    expect(spaceConfirms({ key: ' ', repeat: false, sinceOpenMs: 900 }, false, config)).toBe(false);
    expect(spaceConfirms({ key: 'Enter', repeat: false, sinceOpenMs: 900 }, true, config)).toBe(false);
  });

  it('pauza: zapis do slotu, wyjście i czat tylko Enterem', () => {
    expect(isPauseItemSpaceSafe(PauseItem.Resume)).toBe(true);
    expect(isPauseItemSpaceSafe(PauseItem.Settings)).toBe(true);
    for (const item of [PauseItem.Slot1, PauseItem.Slot2, PauseItem.Slot3, PauseItem.Quit, PauseItem.Feedback]) {
      expect(isPauseItemSpaceSafe(item)).toBe(false);
    }
    expect(isPauseItemSpaceSafe(null)).toBe(false);
  });

  it('menu: nowy run spacją tylko, gdy nie ma autozapisu do stracenia', () => {
    expect(isMenuEntrySpaceSafe(MenuEntry.NewTower, false)).toBe(true);
    expect(isMenuEntrySpaceSafe(MenuEntry.NewTower, true)).toBe(false);
    expect(isMenuEntrySpaceSafe(MenuEntry.Coop, true)).toBe(false);
    expect(isMenuEntrySpaceSafe(MenuEntry.Continue, true)).toBe(true);
    expect(isMenuEntrySpaceSafe(MenuEntry.Controls, true)).toBe(true);
  });

  it('osłona po otwarciu jest w konfiguracji', () => {
    expect(SPACE_CONFIRM_CONFIG.openGuardMs).toBeGreaterThan(200);
  });
});
