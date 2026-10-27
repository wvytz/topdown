/**
 * Zapis gry (krok 91): autozapis „Kontynuuj” i ręczne sloty.
 * Zapis to punkt kontrolny z wejścia na piętro (arenę) — stan w trakcie piętra nie jest zapisywany.
 * W walce z bossem zapisu nie ma (krok 121, `BossSaveLock` w `systems/SaveGame.ts`).
 */
export const SAVE_CONFIG = {
  /** Liczba ręcznych slotów (pauza → 1, 2, 3). */
  slotCount: 3,
  /** Klucze localStorage; `v1` = wersja formatu zapisu. */
  autosaveKey: 'tower-crawler.save.auto.v1',
  slotKeyPrefix: 'tower-crawler.save.slot',
  slotKeySuffix: '.v1',
  /**
   * Czy run wczytany z ręcznego slotu trafia na tablicę wyników. false = nie (inaczej wystarczy
   * wczytywać zapis przed trudnym piętrem aż do skutku). Autozapis „Kontynuuj” zawsze się liczy — znika po śmierci.
   */
  manualLoadRanked: false,
} as const;

/** Napisy zapisu (menu, pauza, ekran śmierci). */
export const SAVE_TEXT = {
  emptySlot: '— pusty —',
  slotName: (slot: number): string => `SLOT ${slot}`,
  autosaveName: 'AUTOZAPIS',
  checkpointNote: 'zapis = stan z wejścia na piętro',
  unrankedNote: 'run wczytany ze slotu nie trafia na tablicę',
  savedToast: (slot: number): string => `Zapisano w slocie ${slot}`,
  saveFailed: 'Nie udało się zapisać (magazyn przeglądarki zablokowany)',
  deathHeader: 'RUN Z ZAPISU — WYNIK NIE TRAFIA NA TABLICĘ',
  loadedToast: 'Wczytano zapis — wynik nie trafi na tablicę',
} as const;
