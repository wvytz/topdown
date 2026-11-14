import type { RoomEventConfig } from '@/systems/RoomEvents';
import { RoomEventKind } from '@/systems/RoomEvents';

/**
 * Wydarzenia w pokojach (krok U8a, lek na „grę powtarzalną” z audytu upgradu): co któryś pokój z nawałą dostaje
 * jedną regułę. Bez napisów (uwaga właściciela 13.11 przy zasadzce: „pokój ma zaskakiwać, nie tłumaczyć”) —
 * regułę widać w samym pokoju: pochodnia gaśnie, sakiewka ucieka, światło znika.
 */
export const ROOM_EVENT_CONFIG: RoomEventConfig = {
  /** Wyłącznik całości (plan U8: „wyłącznik każdej nowości w config”). */
  enabled: true,
  /** Rodzaje w puli (usunięcie z listy wyłącza jeden rodzaj). */
  kinds: [RoomEventKind.Torch, RoomEventKind.Purse, RoomEventKind.Dark],
  /** Najwyżej tyle wydarzeń na piętrze (indeks = piętro − 1, dalej ostatnia); co najmniej jeden pokój nawały zostaje zwykły. */
  countByFloor: [1, 2, 2, 2, 3, 3, 3],
  /** Szansa na każde wydarzenie z puli piętra — część pięter ma ich mniej. */
  chance: 0.8,
  /** „Zabij, zanim zgaśnie pochodnia”: pochodnia na środku pokoju płonie tyle, ile trwa nawała z zapasem. */
  torch: {
    baseMs: 10_000,
    perWaveMs: 7_500,
    /** Złoto za wybicie pokoju przed zgaśnięciem: baza + przyrost na piętro. */
    reward: { base: 18, perFloor: 5 },
    /** Zgaśnięcie: mrok jak w zasadzce (siła 0..1), dopóki pokój nie jest wybity. */
    burnoutDread: 0.85,
    /** Ostatnie tyle ułamka czasu: płomień migocze — ostrzeżenie. */
    warnFraction: 0.25,
    /** Promień światła pochodni na starcie i tuż przed zgaśnięciem (px). */
    lightRadius: { full: 120, end: 40 },
  },
  /** „Złoto ucieka”: sakiewka na nóżkach umyka bohaterom; złapana pęka złotem, po czasie zapada się w szczelinę. */
  purse: {
    lifetimeMs: 13_000,
    /** Wolniej od najwolniejszego bohatera (Czarodziejka 175 px/s) — da się dogonić, ale nie za darmo. */
    speed: 135,
    /** Bohater bliżej niż tyle (px) — sakiewka ucieka; dalej — kręci się po pokoju. */
    panicRadius: 150,
    wanderSpeed: 55,
    /** Złapanie: dotyk w tym promieniu (px). */
    catchRadius: 18,
    /** Odpychanie od murów zaczyna się tyle px od krawędzi pokoju. */
    wallMargin: 40,
    /** Sakiewka wyskakuje chwilę po wejściu (bohater widzi ją, zanim ruszy tłum). */
    spawnDelayMs: 300,
    reward: { base: 24, perFloor: 7 },
  },
  /** „Ciemny pokój”: światło gaśnie po wejściu, wraca po wybiciu; za przetrwanie — złoto. */
  dark: {
    dread: 0.9,
    fadeMs: 700,
    reward: { base: 14, perFloor: 4 },
  },
};
