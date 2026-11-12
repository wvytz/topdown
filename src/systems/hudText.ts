/**
 * Napisy nowego HUD-u (krok U7) bez silnika: cel piętra w wersji pełnej i krótkiej, nagłówek piętra
 * z modyfikatorem, złoto i widoczność napisów, które gasną po chwili (STYLEGUIDE §13.10: HUD nie zasłania walki).
 */

/** Stan potrzebny do podpowiedzi celu. */
export interface ObjectiveState {
  readonly bossRush: boolean;
  readonly boss: boolean;
  readonly stairsUnlocked: boolean;
  readonly onStairs: boolean;
  readonly enemiesAlive: number;
}

/** Barwa podpowiedzi: zwykła, schody, boss, areny. */
export type ObjectiveTone = 'plain' | 'stairs' | 'boss' | 'arena';

export interface ObjectiveHint {
  /** Zmienia się, gdy zmienia się sam cel (a nie liczba wrogów) — wtedy znów widać pełną podpowiedź. */
  readonly key: string;
  readonly long: string;
  readonly short: string;
  readonly tone: ObjectiveTone;
}

/** Teksty trybu aren (z `BOSS_RUSH_TEXT`). */
export interface ObjectiveTexts {
  readonly fightHint: string;
  readonly arenaHint: string;
}

/** Podpowiedź celu: pełna po zmianie celu, potem krótka. `pressE` — „Naciśnij E” albo „Stuknij E”. */
export function objectiveHint(state: ObjectiveState, pressE: string, arena: ObjectiveTexts): ObjectiveHint {
  const enemies = `Wrogowie: ${state.enemiesAlive}`;
  if (state.bossRush) {
    return state.boss
      ? { key: 'arena-boss', long: arena.fightHint, short: 'Boss', tone: 'arena' }
      : { key: 'arena', long: `${enemies} · ${arena.arenaHint}`, short: enemies, tone: 'arena' };
  }
  if (state.stairsUnlocked) {
    return state.onStairs
      ? { key: 'on-stairs', long: `${pressE}, aby wspiąć się wyżej`, short: `${pressE}, aby wspiąć się wyżej`, tone: 'stairs' }
      : { key: 'stairs', long: `Schody otwarte — stań na nich i ${pressE.toLowerCase()}, aby wspiąć się wyżej`, short: 'Schody otwarte', tone: 'stairs' };
  }
  if (state.boss) return { key: 'boss', long: 'Pokonaj bossa, aby otworzyć schody · unikaj stref ataku', short: 'Pokonaj bossa', tone: 'boss' };
  return { key: 'explore', long: `${enemies} · znajdź komnatę bossa (zakratowane schody)`, short: enemies, tone: 'plain' };
}

/** Nagłówek piętra: „Piętro 5 · Złota żyła” (krok U7b: opis modyfikatora ma własną linię — `floorModifierNote`). */
export function floorHeadline(label: string, modifier: { readonly name: string } | null): string {
  return modifier ? `${label} · ${modifier.name}` : label;
}

/** Opis modyfikatora piętra pod przedmiotami: tylko przez pierwsze `longMs` na piętrze, potem pusty. */
export function floorModifierNote(modifier: { readonly description: string } | null, sinceFloorMs: number, longMs: number): string {
  return modifier && sinceFloorMs < longMs ? modifier.description : '';
}

/** Krycie napisu widocznego przez `visibleMs`, który potem gaśnie przez `fadeMs`. */
export function fadingAlpha(elapsedMs: number, visibleMs: number, fadeMs: number): number {
  if (elapsedMs < visibleMs) return 1;
  if (fadeMs <= 0) return 0;
  return Math.max(0, 1 - (elapsedMs - visibleMs) / fadeMs);
}

/** Dopisek przy złocie: wynik nie trafia na tablicę albo trafia na tablicę aren. */
export function goldNote(state: { readonly bossRush: boolean; readonly practice: boolean }, arenaSuffix: string): string {
  if (state.bossRush) return arenaSuffix;
  if (state.practice) return 'run testowy — bez wyniku';
  return 'wynik';
}
