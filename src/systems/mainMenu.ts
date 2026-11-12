/**
 * Menu główne (krok 91): pozycje i ruch kursora — czysta logika, scena Phasera tylko rysuje.
 */
export enum MenuEntry {
  /** Popielnik (Akt II, krok Z1): kryjówka — w menu dopiero po pierwszym pokonaniu Wiedźmy. */
  Hideout = 'hideout',
  Continue = 'continue',
  NewTower = 'new-tower',
  /** Lokalny co-op dla dwóch (etap C5): ekran dołączania, potem wspinaczka. */
  Coop = 'coop',
  BossRush = 'boss-rush',
  /** Wybór piętra: nowy run od piętra, którego bossa gracz już pokonał. */
  FloorSelect = 'floor-select',
  Load = 'load',
  Controls = 'controls',
}

export const MENU_ORDER: readonly MenuEntry[] = [
  MenuEntry.Continue,
  MenuEntry.NewTower,
  MenuEntry.Coop,
  MenuEntry.BossRush,
  MenuEntry.FloorSelect,
  MenuEntry.Load,
  MenuEntry.Controls,
];

/** Pozycje menu dla gracza: Popielnik na górze, gdy jest odblokowany; inaczej lista bez zmian. */
export function menuOrder(availability: Pick<MenuAvailability, 'hideout'>): readonly MenuEntry[] {
  return availability.hideout ? [MenuEntry.Hideout, ...MENU_ORDER] : MENU_ORDER;
}

export interface MenuAvailability {
  readonly hasAutosave: boolean;
  readonly hasSlots: boolean;
  /** Najwyższe piętro z pokonanym bossem (0 = żadne). */
  readonly bestBossFloor: number;
  /** Co-op tylko na komputerze (decyzja właściciela: bez wersji mobilnej); brak = dostępny. */
  readonly coop?: boolean;
  /** Popielnik odblokowany (krok Z1); brak = nie. */
  readonly hideout?: boolean;
}

/** Czy pozycję da się wybrać: „Kontynuuj” tylko z autozapisem, „Wczytaj” — z co najmniej jednym slotem, wybór piętra — po pierwszym bossie. */
export function isEntryEnabled(entry: MenuEntry, availability: MenuAvailability): boolean {
  switch (entry) {
    case MenuEntry.Continue:
      return availability.hasAutosave;
    case MenuEntry.Load:
      return availability.hasSlots;
    case MenuEntry.FloorSelect:
      return availability.bestBossFloor >= 1;
    case MenuEntry.Coop:
      return availability.coop !== false;
    case MenuEntry.Hideout:
      return availability.hideout === true;
    default:
      return true;
  }
}

/** Następna aktywna pozycja w kierunku `delta` (±1), z zawijaniem; bez aktywnych — bez zmian. */
export function moveCursor(enabled: readonly boolean[], index: number, delta: number): number {
  const count = enabled.length;
  for (let step = 1; step <= count; step++) {
    const next = (((index + delta * step) % count) + count) % count;
    if (enabled[next]) return next;
  }
  return index;
}

/** Pozycja zaznaczona na starcie: wskazana (np. tryb z adresu), potem „Kontynuuj”, Popielnik (gdy jest na liście), potem nowa wspinaczka. */
export function initialEntry(order: readonly MenuEntry[], availability: MenuAvailability, preferred: MenuEntry | null): number {
  const candidates = [preferred, MenuEntry.Continue, MenuEntry.Hideout, MenuEntry.NewTower];
  for (const entry of candidates) {
    if (entry === null) continue;
    const index = order.indexOf(entry);
    if (index >= 0 && isEntryEnabled(entry, availability)) return index;
  }
  return Math.max(0, order.findIndex((entry) => isEntryEnabled(entry, availability)));
}
