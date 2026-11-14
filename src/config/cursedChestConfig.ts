import { EnemyType } from '@/core/combatTypes';
import type { CursedChestConfig } from '@/systems/CursedChest';

/**
 * Przeklęta skrzynia (krok U8b, „pokoje ryzyka” z backlogu po kroku 41g): wybór gracza, nie zasadzka. Otwarta budzi
 * klątwę — elity wychodzą wokół skrzyni; po ich wybiciu skrzynia oddaje przedmiot i złoto. Można ją ominąć.
 */
export const CURSED_CHEST_CONFIG: CursedChestConfig = {
  /** Wyłącznik (plan U8: „wyłącznik każdej nowości w config”). */
  enabled: true,
  /** Szansa na skrzynię na piętrze (indeks = piętro − 1, dalej ostatnia). Piętro 1 rzadziej — nauka. */
  chanceByFloor: [0.35, 0.6, 0.6, 0.7, 0.7, 0.7, 0.7],
  /** Elit w klątwie wg piętra (indeks = piętro − 1, dalej ostatnia). */
  elitesByFloor: [2, 2, 2, 3, 3, 3, 3],
  /** Archetypy elit klątwy (losowane po kolei). */
  types: [EnemyType.Rusher, EnemyType.Kiter],
  /** Cechy elity klątwy ponad zwykłą liczbę z pętli wieży. */
  extraAffixes: 0,
  /** Elity wychodzą w pierścieniu tyle kafli od skrzyni. */
  ringTiles: 2,
  /** Wyjście elit: znacznik na podłodze i bierne wychodzenie (jak nawała). */
  telegraphMs: 700,
  riseMs: 500,
  /** Bohater bliżej niż tyle px — podpowiedź [E]. */
  interactRadius: 40,
  /** Złoto z przedmiotem po zdjęciu klątwy: baza + przyrost na piętro. */
  reward: { base: 20, perFloor: 6 },
};
