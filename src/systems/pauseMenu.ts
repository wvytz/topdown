/**
 * Ekran pauzy jako małe menu (krok 120, prośba właściciela: „za dużo tekstu”). Strona główna ma pięć pozycji,
 * a zapis, ustawienia i opis sterowania leżą na osobnych podstronach. Tu tylko zasady: jakie pozycje ma strona,
 * ruch kursora i dokąd prowadzi „wstecz”. Rysowanie — `scenes/PauseScene.ts`.
 */

export enum PausePage {
  Main = 'main',
  Save = 'save',
  Settings = 'settings',
  Controls = 'controls',
}

export enum PauseItem {
  Resume = 'resume',
  Save = 'save',
  Settings = 'settings',
  Controls = 'controls',
  /** Czat „Napisz do autora” (krok 133). */
  Feedback = 'feedback',
  Quit = 'quit',
  Slot1 = 'slot1',
  Slot2 = 'slot2',
  Slot3 = 'slot3',
  Music = 'music',
  Sfx = 'sfx',
  Mute = 'mute',
  Fill = 'fill',
  Fullscreen = 'fullscreen',
  Back = 'back',
}

/**
 * Co jest dostępne w tej chwili: zapis (nie przy odtwarzaniu nagrania), ustawienia obrazu (tylko PC)
 * i czat z autorem (krok 133; tylko gdy gra zna adres workera).
 */
export interface PauseMenuOptions {
  readonly canSave: boolean;
  readonly display: boolean;
  readonly feedback?: boolean;
}

const SLOTS = [PauseItem.Slot1, PauseItem.Slot2, PauseItem.Slot3] as const;

export function pauseItems(page: PausePage, options: PauseMenuOptions): readonly PauseItem[] {
  switch (page) {
    case PausePage.Main:
      return [
        PauseItem.Resume,
        ...(options.canSave ? [PauseItem.Save] : []),
        PauseItem.Settings,
        PauseItem.Controls,
        ...(options.feedback ? [PauseItem.Feedback] : []),
        PauseItem.Quit,
      ];
    case PausePage.Save:
      return [...SLOTS, PauseItem.Back];
    case PausePage.Settings:
      return [
        PauseItem.Music,
        PauseItem.Sfx,
        PauseItem.Mute,
        ...(options.display ? [PauseItem.Fill, PauseItem.Fullscreen] : []),
        PauseItem.Back,
      ];
    case PausePage.Controls:
      return [PauseItem.Back];
  }
}

/** Numer slotu zapisu (1–3) albo null, gdy pozycja nie jest slotem. */
export function slotOf(item: PauseItem): number | null {
  const index = (SLOTS as readonly PauseItem[]).indexOf(item);
  return index < 0 ? null : index + 1;
}

/** Kursor w górę (-1) albo w dół (+1), z zawijaniem; brak kursora — pierwsza albo ostatnia pozycja. */
export function movePauseCursor(items: readonly PauseItem[], current: PauseItem | null, step: -1 | 1): PauseItem | null {
  if (items.length === 0) return null;
  const index = current === null ? -1 : items.indexOf(current);
  if (index < 0) return (step > 0 ? items[0] : items[items.length - 1]) ?? null;
  return items[(index + step + items.length) % items.length] ?? null;
}

/** Strona otwierana przez pozycję strony głównej; null — pozycja niczego nie otwiera. */
export function pageOf(item: PauseItem): PausePage | null {
  switch (item) {
    case PauseItem.Save:
      return PausePage.Save;
    case PauseItem.Settings:
      return PausePage.Settings;
    case PauseItem.Controls:
      return PausePage.Controls;
    default:
      return null;
  }
}

/**
 * „Wstecz” (Esc, B na padzie): z podstrony wraca na główną, z kursorem na pozycji, która ją otworzyła;
 * na stronie głównej — null, czyli wznów grę.
 */
export function pauseBack(page: PausePage): { readonly page: PausePage; readonly cursor: PauseItem } | null {
  switch (page) {
    case PausePage.Main:
      return null;
    case PausePage.Save:
      return { page: PausePage.Main, cursor: PauseItem.Save };
    case PausePage.Settings:
      return { page: PausePage.Main, cursor: PauseItem.Settings };
    case PausePage.Controls:
      return { page: PausePage.Main, cursor: PauseItem.Controls };
  }
}
