import { MenuEntry } from '@/systems/mainMenu';
import { PauseItem } from '@/systems/pauseMenu';

/**
 * Spacja jako „wybierz” w menu (krok 161, uwaga testera). W kroku 129/130 spację zabraliśmy, bo to dash:
 * wciśnięta w biegu przy otwarciu pauzy wybrała opcję i gracz stracił zapis. Teraz wraca, ale tylko:
 * - na pozycjach bezpiecznych (nic nie nadpisuje zapisu i nie kończy runu),
 * - po świeżym wciśnięciu (bez autopowtórzenia) i nie zaraz po otwarciu ekranu (spacja z biegu się nie liczy).
 * Czysta logika — sceny pytają ją przed zamianą spacji na `MenuCommand.Confirm`.
 */
export interface SpaceConfirmConfig {
  /** Tyle ms po otwarciu ekranu spacja jeszcze nic nie wybiera. */
  readonly openGuardMs: number;
}

export interface SpacePress {
  readonly key: string;
  readonly repeat: boolean;
  /** Ile ms minęło od otwarcia ekranu. */
  readonly sinceOpenMs: number;
}

export function isSpaceKey(key: string): boolean {
  return key === ' ' || key === 'Spacebar';
}

/** Czy to wciśnięcie spacji można potraktować jak „wybierz” na pozycji `safe`. */
export function spaceConfirms(press: SpacePress, safe: boolean, config: SpaceConfirmConfig): boolean {
  return isSpaceKey(press.key) && !press.repeat && press.sinceOpenMs >= config.openGuardMs && safe;
}

/** Pauza: zapis do slotu (nadpisanie), wyjście do menu (koniec runu) i czat (spacja wpisałaby się w pole) — tylko Enter. */
const PAUSE_UNSAFE: ReadonlySet<PauseItem> = new Set([PauseItem.Slot1, PauseItem.Slot2, PauseItem.Slot3, PauseItem.Quit, PauseItem.Feedback]);

export function isPauseItemSpaceSafe(item: PauseItem | null): boolean {
  return item !== null && !PAUSE_UNSAFE.has(item);
}

/** Pozycje menu głównego, które zaczynają nowy run — przy istniejącym autozapisie „Kontynuuj” by go zastąpiły. */
const NEW_RUN_ENTRIES: ReadonlySet<MenuEntry> = new Set([MenuEntry.NewTower, MenuEntry.Coop, MenuEntry.BossRush, MenuEntry.FloorSelect]);

export function isMenuEntrySpaceSafe(entry: MenuEntry | undefined, hasAutosave: boolean): boolean {
  if (entry === undefined) return false;
  return !(hasAutosave && NEW_RUN_ENTRIES.has(entry));
}
