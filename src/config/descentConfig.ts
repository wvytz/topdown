import type { FloorModifierEffects } from '@/core/floorModifierTypes';
import { GateReward } from '@/core/lootTypes';

/**
 * Zejście (Akt II, krok Z1; `docs/AKT2.md` §4): run z Popielnika w dół. Dopóki próby zaświatów nie mają własnych
 * biomów, piętra Zejścia to „odbicia” pięter wieży: ten sam biom i boss w czerwonym świetle, z regułą zaświatów.
 */
export interface DescentConfig {
  /** Pięter w jednym Zejściu (decyzja właściciela 11.11.2026: 6, „później doprecyzujemy”). */
  readonly floors: number;
  /** Odbicie, od którego Zejście zawsze się zaczyna, i to, na którym zawsze się kończy (piętra wieży). */
  readonly firstFloor: number;
  readonly lastFloor: number;
  /** Żar: za zwykłego wroga, elitę i bossa odbicia; premia za dojście na Dno. */
  readonly embers: { readonly enemy: number; readonly elite: number; readonly boss: number; readonly victory: number };
  /** Ile Żaru zebranego od ostatniego bossa zostaje po śmierci (decyzja właściciela: połowa). */
  readonly deathKeepRatio: number;
  /** Reguła zaświatów: mnożniki nakładane na każde piętro Zejścia (razem z modyfikatorem piętra). */
  readonly rule: Partial<FloorModifierEffects>;
  /** Barwa mroku w zaświatach (zamiast barwy biomu) — czerwone odbicie wieży z ikonki gry. */
  readonly darknessColor: number;
}

export const DESCENT_CONFIG: DescentConfig = {
  floors: 6,
  firstFloor: 1,
  lastFloor: 7,
  embers: { enemy: 1, elite: 4, boss: 25, victory: 40 },
  deathKeepRatio: 0.5,
  rule: { enemySpeedMultiplier: 1.1, enemyDamageMultiplier: 1.1 },
  darknessColor: 0x3a0508,
};

/** Sól strumienia RNG trasy Zejścia (własny strumień — zasada 4). */
export const DESCENT_ROUTE_SALT = 0xde5c;

export const DESCENT_TEXT = {
  modeName: 'ZEJŚCIE',
  /** Napis w HUD zamiast numeru piętra. */
  hudLabel: (depth: number, floors: number, biome: string) => `Zejście ${depth}/${floors} · odbicie: ${biome}`,
  rule: 'Zaświaty: wrogowie szybsi i mocniejsi o 10%',
  startToast: 'Zejście — Żar jest bezpieczny dopiero po bossie',
  stairsPrompt: '[E] Zejdź głębiej',
  stairsPromptFinal: '[E] Dotknij Dna',
  embersHud: (secured: number, loose: number) => (loose > 0 ? `Żar: ${secured} (+${loose})` : `Żar: ${secured}`),
  embersSecured: (amount: number) => `Żar bezpieczny: ${amount}`,
  /** Krok Z3: boss zostawił Wotum — trafia do Pieca wotów w Popielniku. */
  votiveFound: (name: string) => `Wotum: ${name} — wypal je w Piecu wotów`,
  deathResult: (score: number, depth: number, floors: number, embers: number) => `${score} ZŁOTA · GŁĘBIA ${depth}/${floors} · ŻAR +${embers}`,
  victoryResult: (score: number, embers: number) => `DNO ZDOBYTE · ${score} ZŁOTA · ŻAR +${embers}`,
  deathPrompt: 'R — ZEJDŹ ZNOWU · C — ZMIEŃ BOHATERA · M — POPIELNIK',
  boardHeaders: { local: 'ZEJŚCIE — NAJLEPSZE WYNIKI (LOKALNE)', pending: 'ZEJŚCIE — NAJLEPSZE WYNIKI (LOKALNE)', shared: 'ZEJŚCIE — NAJLEPSZE WYNIKI' },
  selectHint: 'Zejście przez odbicia wieży — od zera, z Popielnika',
} as const;

/**
 * Krok Z4 (`docs/AKT2.md` §4): po bossie odbicia zamiast schodów dwie bramy — każda z odbiciem i podpowiedzią
 * nagrody. Kupiec stoi w przejściu między głębiami (stałe głębie) albo za bramą z nagrodą „kupiec”.
 */
export const DESCENT_GATES = {
  /** Sól strumienia RNG bram (seed runu + piętro, z którego się wychodzi). */
  seedSalt: 0x6a7e,
  /** Nagrody do losowania na bramach (dwie różne na parę bram). */
  rewards: [GateReward.Embers, GateReward.Merchant, GateReward.Gold] as readonly GateReward[],
  /** Mnożnik Żaru z wrogów i bossa odbicia za bramą „więcej Żaru”. */
  embersMultiplier: 1.5,
  /** Mnożnik złota z wrogów za bramą „więcej złota”. */
  goldMultiplier: 1.3,
  /** Głębie, na których kupiec stoi zawsze — przejście między głębiami I/II i II/III z §4. */
  merchantDepths: [3, 5] as readonly number[],
} as const;

/** Kupiec Zejścia (krok Z4): towar za złoto, czyli kosztem wyniku — jak ofiara w kapliczce. */
export const MERCHANT_CONFIG = {
  /** Sól strumienia RNG towaru. */
  seedSalt: 0x3e7c,
  /** Ile przedmiotów na ladzie (do tego leczenie). */
  items: 2,
  /** Cena przedmiotu: baza + za każdą głębię ponad pierwszą. */
  itemPrice: { base: 30, perDepth: 10 },
  /** Leczenie: ułamek maks. HP i cena. */
  heal: { pct: 0.5, base: 15, perDepth: 5 },
  /** Promień rozmowy z kupcem (px). */
  interactRadius: 40,
} as const;

export const GATE_TEXT = {
  headline: 'DWIE BRAMY',
  hint: 'Wybierz drogę — kliknij bramę albo naciśnij 1–2 (pad: ← → i A)',
  /** Wybiera ten, kto pierwszy stanął przy bramach (co-op). */
  picker: (tag: string) => `${tag} wybiera drogę`,
  card: (depth: number) => `GŁĘBIA ${depth}`,
  reflection: (biome: string) => `odbicie: ${biome}`,
  rewards: {
    [GateReward.Embers]: { title: 'więcej Żaru', body: 'Żar z wrogów i bossa ×1,5', color: 0xff7a3a },
    [GateReward.Merchant]: { title: 'kupiec', body: 'kupiec czeka przy wejściu', color: 0xf5c542 },
    [GateReward.Gold]: { title: 'więcej złota', body: 'złoto z wrogów ×1,3', color: 0xffe08a },
  } as Readonly<Record<GateReward, { readonly title: string; readonly body: string; readonly color: number }>>,
  stairsPrompt: '[E] Wybierz bramę',
  toast: (title: string) => `Brama: ${title}`,
} as const;

export const MERCHANT_TEXT = {
  name: 'Kupiec',
  prompt: '[E] Kupiec',
  headline: 'KUPIEC ZAŚWIATÓW',
  hint: 'Zakup obniża wynik — złoto to punkty. 1–4, klik albo pad (← → i A)',
  heal: (pct: number) => `Leczenie ${Math.round(pct * 100)}% HP`,
  leave: 'Odejdź',
  price: (gold: number) => `${gold} złota`,
  tooPoor: 'za mało złota',
  sold: 'sprzedane',
  arrivedToast: 'Kupiec czeka przy wejściu — zakup obniża wynik',
} as const;
