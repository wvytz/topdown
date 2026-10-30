import { describe, expect, it } from 'vitest';
import { PauseItem, PausePage, movePauseCursor, pageOf, pauseBack, pauseItems, slotOf } from '@/systems/pauseMenu';

const pc = { canSave: true, display: true };

describe('menu pauzy', () => {
  it('strona główna ma pięć pozycji; bez zapisu (nagranie) znika „Zapisz grę”', () => {
    expect(pauseItems(PausePage.Main, pc)).toEqual([PauseItem.Resume, PauseItem.Save, PauseItem.Settings, PauseItem.Controls, PauseItem.Quit]);
    expect(pauseItems(PausePage.Main, { ...pc, canSave: false })).not.toContain(PauseItem.Save);
  });

  it('krok 133: „Napisz do autora” przed „Menu główne”, tylko gdy wysyłka jest dostępna; niczego nie otwiera', () => {
    expect(pauseItems(PausePage.Main, { ...pc, feedback: true })).toEqual([
      PauseItem.Resume, PauseItem.Save, PauseItem.Settings, PauseItem.Controls, PauseItem.Feedback, PauseItem.Quit,
    ]);
    expect(pauseItems(PausePage.Main, { ...pc, feedback: false })).not.toContain(PauseItem.Feedback);
    expect(pageOf(PauseItem.Feedback)).toBeNull();
  });

  it('ustawienia obrazu tylko na PC; każda podstrona kończy się „Wróć”', () => {
    expect(pauseItems(PausePage.Settings, pc)).toContain(PauseItem.Fullscreen);
    expect(pauseItems(PausePage.Settings, { ...pc, display: false })).toEqual([PauseItem.MusicPreset, PauseItem.Music, PauseItem.Sfx, PauseItem.Mute, PauseItem.Back]);
    for (const page of [PausePage.Save, PausePage.Settings, PausePage.Controls]) expect(pauseItems(page, pc).at(-1)).toBe(PauseItem.Back);
  });

  it('kursor zawija się, a bez kursora zaczyna od brzegu', () => {
    const items = pauseItems(PausePage.Main, pc);
    expect(movePauseCursor(items, null, 1)).toBe(PauseItem.Resume);
    expect(movePauseCursor(items, null, -1)).toBe(PauseItem.Quit);
    expect(movePauseCursor(items, PauseItem.Quit, 1)).toBe(PauseItem.Resume);
    expect(movePauseCursor(items, PauseItem.Resume, -1)).toBe(PauseItem.Quit);
    // Pozycja z innej strony traktowana jak brak kursora.
    expect(movePauseCursor(items, PauseItem.Music, 1)).toBe(PauseItem.Resume);
  });

  it('podstrony otwierają się z głównej, a „wstecz” wraca na pozycję, która je otworzyła', () => {
    for (const item of [PauseItem.Save, PauseItem.Settings, PauseItem.Controls]) {
      const page = pageOf(item);
      expect(page).not.toBeNull();
      expect(pauseBack(page as PausePage)).toEqual({ page: PausePage.Main, cursor: item });
    }
    expect(pageOf(PauseItem.Resume)).toBeNull();
    expect(pauseBack(PausePage.Main)).toBeNull();
  });

  it('sloty zapisu mają numery 1–3', () => {
    expect([PauseItem.Slot1, PauseItem.Slot2, PauseItem.Slot3].map(slotOf)).toEqual([1, 2, 3]);
    expect(slotOf(PauseItem.Back)).toBeNull();
  });
});
