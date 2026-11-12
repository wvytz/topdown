/**
 * Zaćmienia (Akt II, krok Z5; `docs/AKT2.md` §6): poziomy trudności Zejścia po pierwszym zwycięstwie.
 * Każde Zaćmienie dokłada jedną regułę do poprzednich i mnoży Żar. Ukończenie poziomu daje rangę i otwiera następny.
 * Liczby wstępne — do strojenia po pomiarze botem (`tools/eclipse-measure.mjs`) i testach właściciela.
 */
export interface EclipseLevel {
  /** Nazwa na karcie i w HUD. */
  readonly name: string;
  /** Reguła, którą ten poziom dokłada (opis na karcie). */
  readonly rule: string;
  /** Mnożnik Żaru z wrogów, bossów i za Dno. */
  readonly embersMultiplier: number;
  /** Cech elit więcej (ponad cechy z kręgu wieży, do sufitu `eliteMaxAffixes`). */
  readonly extraEliteAffixes: number;
  /** Mnożnik leczenia z mikstur (łupy, urny, skrzynie). */
  readonly healMultiplier: number;
  /** Fal nawały więcej w każdym pokoju z nawałą. */
  readonly extraHordeWaves: number;
  /** Mnożnik cen u kupca. */
  readonly merchantPriceMultiplier: number;
  /** Wzmocnienie świty bossów; null — świta jak w wieży. */
  readonly retinue: { readonly extraCount: number; readonly extraMaxAlive: number; readonly intervalMultiplier: number } | null;
}

const BASE: EclipseLevel = {
  name: 'Zejście',
  rule: 'zwykłe Zejście',
  embersMultiplier: 1,
  extraEliteAffixes: 0,
  healMultiplier: 1,
  extraHordeWaves: 0,
  merchantPriceMultiplier: 1,
  retinue: null,
};

const ECLIPSE_I: EclipseLevel = { ...BASE, name: 'Zaćmienie I', rule: 'elity mają cechę więcej, mikstury leczą o 40% mniej', embersMultiplier: 1.25, extraEliteAffixes: 1, healMultiplier: 0.6 };
const ECLIPSE_II: EclipseLevel = { ...ECLIPSE_I, name: 'Zaćmienie II', rule: 'nawała ma falę więcej, kupiec drożeje o połowę', embersMultiplier: 1.5, extraHordeWaves: 1, merchantPriceMultiplier: 1.5 };
const ECLIPSE_III: EclipseLevel = {
  ...ECLIPSE_II,
  name: 'Zaćmienie III',
  rule: 'bossowie wzywają większą świtę i częściej',
  embersMultiplier: 2,
  retinue: { extraCount: 1, extraMaxAlive: 1, intervalMultiplier: 0.75 },
};

export const ECLIPSE_CONFIG = {
  /** Poziomy 0–III; każdy zawiera reguły poprzednich (indeks = poziom). */
  levels: [BASE, ECLIPSE_I, ECLIPSE_II, ECLIPSE_III] as readonly EclipseLevel[],
  /**
   * Rangi (§6): indeks = liczba ukończonych poziomów. Bez zwycięstwa — Śmiałek; Dno na poziomie 0 — Zahartowany,
   * na Zaćmieniu I — Godny, II — Posłaniec, III — Wybraniec.
   */
  ranks: ['Śmiałek', 'Zahartowany', 'Godny', 'Posłaniec', 'Wybraniec'] as readonly string[],
  /** Barwy kart poziomów (od popiołu do czerwieni Czarnego Słońca). */
  colors: [0xb8b0a0, 0xff9a3a, 0xff5a2a, 0xc8201c] as readonly number[],
} as const;

export const ECLIPSE_TEXT = {
  headline: 'ZAĆMIENIE',
  hint: 'Wybierz poziom Zejścia — kliknij kartę albo 1–4 (pad: ← → i A)',
  roman: ['0', 'I', 'II', 'III'] as readonly string[],
  /** Krótki znak poziomu w HUD i na tablicy. */
  badge: (level: number) => (level > 0 ? `Zać. ${ECLIPSE_TEXT.roman[level] ?? level}` : ''),
  embers: (multiplier: number) => `Żar ×${String(multiplier).replace('.', ',')}`,
  rankReward: (rank: string) => `ranga: ${rank}`,
  locked: 'ukończ poprzedni poziom',
  /** Poziomy II+ zawierają reguły poprzednich. */
  cumulative: (rule: string) => `to co wyżej, a do tego: ${rule}`,
  gatePrompt: (name: string) => `Zejdź sam · ${name}`,
  gateCoopPrompt: (name: string) => `Zejdźcie we dwoje · ${name}`,
  newRank: (rank: string) => `NOWA RANGA: ${rank.toUpperCase()}`,
  unlocked: (name: string) => `Otwarte: ${name}`,
  startToast: (name: string, rule: string) => `${name}: ${rule}`,
} as const;

/**
 * Trzecia karta u kupca (krok Z5, wydatek Żaru z §5): wygoda, nie siła — jednorazowo w Popielniku przy Kramie,
 * potem kupiec Zejścia zawsze wykłada jeden przedmiot więcej.
 */
export const STALL_CONFIG = {
  cost: 60,
  extraItems: 1,
} as const;
