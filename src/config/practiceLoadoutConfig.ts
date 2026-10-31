/**
 * Szybki start testowy (krok 148, pomysł właściciela): `?floor=N&boss=1` daje bohaterowi przedmioty i złoto,
 * jakie zebrałby zwykle w trakcie normalnego przejścia pięter 1…N−1. Symulacja w `systems/PracticeLoadout.ts`
 * używa prawdziwych tabel łupów, kart za bossa, kapliczki, zasadzek i ukrytej komnaty — tu są tylko założenia
 * o tym, jak gra „przeciętny” gracz.
 */
export interface PracticeLoadoutConfig {
  readonly urlParam: string;
  readonly offValue: string;
  readonly killShare: number;
  readonly quietRooms: number;
  readonly shrineChance: number;
}

export const PRACTICE_LOADOUT_CONFIG: PracticeLoadoutConfig = {
  /** Parametr adresu: `?items=0` wyłącza zestaw (stary start „z pustymi rękami”). */
  urlParam: 'items',
  offValue: '0',
  /** Część wrogów piętra, których gracz zabija (resztę omija w drodze do schodów). */
  killShare: 0.85,
  /** Pokoje bez zwykłych wrogów: start i arena bossa. */
  quietRooms: 2,
  /**
   * Szansa, że gracz złoży ofiarę w kapliczce, gdy ma dość złota (raz na piętro). Ofiara obniża wynik,
   * więc część graczy ją omija; 0 = nigdy.
   */
  shrineChance: 0.6,
};
