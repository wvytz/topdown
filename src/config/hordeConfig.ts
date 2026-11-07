import type { HordeConfig } from '@/systems/Horde';

/**
 * Nawała (krok 175, wizja „natłok mobów” z kroku 143, decyzja właściciela 7.11): pierwsze wejście bohatera do
 * zwykłego pokoju budzi fale kruchych stworków biomu (te same co z gniazd — czerw, pajęczak, zarodnik, dłoń…).
 * Giną od 1–2 ciosów, gryzą słabo, bez łupu i bez ładowania ultimate — groźne tylko tłumem.
 * Trudność rośnie liczbą i liczbą fal, nie HP pojedynczego wroga (patrz `ENEMY_SCALING`).
 */
export const HORDE_CONFIG: HordeConfig = {
  /** Szansa na nawałę w zwykłym pokoju wg piętra (indeks = piętro − 1, dalej ostatnia). Piętro 1 — nauka. */
  roomChanceByFloor: [0.5, 0.8, 1],
  /** Liczba fal wg piętra (indeks = piętro − 1, dalej ostatnia). */
  wavesByFloor: [1, 2, 2, 2, 3, 3, 3],
  /** Stworków w fali: baza + przyrost na piętro, z sufitem. */
  perWave: { base: 4, perFloor: 0.5, max: 8 },
  /** Co-op: dodatkowe stworki w każdej fali. */
  coopExtraPerWave: 2,
  /** Pierwsza fala chwilę po wejściu (bohater widzi pokój, zanim ruszy tłum). */
  firstWaveDelayMs: 500,
  /** Następna fala, gdy z poprzednich żyje najwyżej tylu … */
  nextWhenAliveAtMost: 2,
  /** … albo najpóźniej po tym czasie od poprzedniej. */
  nextWaveAfterMs: 7000,
  /** Znacznik na podłodze przed wyjściem stworka (telegraf) i czas wykluwania (nietykalny, bierny). */
  telegraphMs: 600,
  riseMs: 400,
  /** Miejsca wyjścia co najmniej tyle kafli od bohaterów. */
  minPlayerDistanceTiles: 3,
  /** Wejście do pokoju liczy się, gdy bohater jest tyle kafli w głąb od muru (nie w progu). */
  entryMarginTiles: 1,
  /** Sufit żywych wrogów na piętrze (wydajność na telefonie — raport z 30.10); nadmiar czeka w kolejce. */
  maxAliveEnemies: 22,
};
