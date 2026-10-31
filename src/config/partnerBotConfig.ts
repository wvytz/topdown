import type { HeroKit } from '@/core/heroTypes';

/** Jak bot walczy danym rodzajem broni (px świata). */
export interface BotKitTactics {
  /** Bot podchodzi do celu na taki odstęp (od brzegu celu). */
  readonly preferredRangePx: number;
  /** Bliżej niż tyle (od brzegu celu) — bot się cofa; 0 = nigdy (wręcz). */
  readonly retreatBelowPx: number;
  /** Atak główny (LPM), gdy cel jest bliżej niż tyle (od brzegu celu). */
  readonly attackRangePx: number;
  /** Atak dodatkowy (PPM) z ładunków — wtedy, gdy cel bliżej niż tyle; 0 = bot nie używa PPM. */
  readonly shootRangePx: number;
  /** Dash odskoku, gdy cel bliżej niż tyle (od brzegu); 0 = bez odskoku. */
  readonly panicDashPx: number;
}

/**
 * Bot-partner (krok 146, ukryty tryb `?bot=1`, pomysł właściciela): drugi bohater sterowany przez AI —
 * idzie za graczem, bije wrogów i wskrzesza powalonego. Liczby do strojenia po testach właściciela.
 */
export const PARTNER_BOT_CONFIG = {
  /** Parametr adresu włączający bota (`?bot=1` albo `?bot=archer` — wybrany bohater bota). */
  urlParam: 'bot',
  /** Podpis bota w HUD i na kartach nagrody (zamiast „P2”). */
  tag: 'BOT',
  /** Połowa szerokości ciała bohatera (px) — droga po prostej omija rogi muru z takim zapasem. */
  bodyHalfWidthPx: 9,
  /** Co ile ms bot liczy drogę po kaflach od nowa. */
  repathMs: 250,
  /** Bliżej gracza niż tyle (px) bot w spokoju stoi; dalej podchodzi. */
  followIdlePx: 44,
  /** Dalej od gracza niż tyle (px) bot przerywa walkę i wraca. */
  followMaxPx: 150,
  /** Bot bije tylko wrogów bliżej siebie niż tyle (px) i widocznych. */
  engageRangePx: 200,
  /** … i tylko takich, którzy są bliżej gracza niż tyle (px) — nie odciąga drużyny. */
  engageLeaderRangePx: 220,
  /** Wskrzeszając, bot staje tak blisko powalonego (px; promień wskrzeszania to 30). */
  reviveStandPx: 10,
  /** Dash doganiania, gdy gracz dalej niż tyle (px) i jest prosta droga. */
  catchUpDashPx: 190,
  /** Najkrótszy odstęp między dashami bota (ms). */
  dashCooldownMs: 1200,
  /** Teleport do gracza: dalej niż tyle (px)… */
  warpDistancePx: 230,
  /** … przez tyle ms bez przerwy (np. utknął za kratą albo rogiem). */
  warpAfterMs: 1600,
  /** Utknięcie: bot chce iść, a przez tyle ms przesunął się mniej niż `stuckMovePx` — teleport. */
  stuckMs: 2200,
  stuckMovePx: 12,
  /** Ultimate: gdy w promieniu `ultimateCrowdPx` jest co najmniej tylu wrogów… */
  ultimateCrowd: 3,
  ultimateCrowdPx: 120,
  /** … albo duży cel (boss — promień od tylu px) w zasięgu ataku. */
  ultimateBossRadiusPx: 18,
  /** Taktyka według broni bohatera. */
  tactics: {
    melee: { preferredRangePx: 10, retreatBelowPx: 0, attackRangePx: 26, shootRangePx: 160, panicDashPx: 0 },
    sorcery: { preferredRangePx: 105, retreatBelowPx: 60, attackRangePx: 200, shootRangePx: 0, panicDashPx: 24 },
    archery: { preferredRangePx: 125, retreatBelowPx: 70, attackRangePx: 220, shootRangePx: 170, panicDashPx: 24 },
  } satisfies Record<HeroKit['kind'], BotKitTactics>,
} as const;

export type PartnerBotConfig = typeof PARTNER_BOT_CONFIG;
