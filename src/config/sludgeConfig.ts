import type { PlatformId } from '@/core/platform';
import type { SpriteSheetId } from '@/config/spriteConfig';

/**
 * Promienie kałuż szlamu z arkuszy `tools/sludge_sprites.py` (`sludge-puddle-R.png`). Kałuża w grze bierze arkusz
 * o swoim promieniu — rysunek to dokładny zasięg spowolnienia, bez skalowania pikseli.
 */
export const SLUDGE_PUDDLE_RADII = [14, 30, 44, 56] as const;
export type SludgePuddleRadius = (typeof SLUDGE_PUDDLE_RADII)[number];

export const SLUDGE_PUDDLE_SHEETS: Readonly<Record<SludgePuddleRadius, SpriteSheetId>> = {
  14: 'sludgePuddle14',
  30: 'sludgePuddle30',
  44: 'sludgePuddle44',
  56: 'sludgePuddle56',
};

/** Arkusz kałuży dla promienia z konfiguracji bossa (najbliższy mniejszy lub równy, by rysunek nie wyszedł poza zasięg). */
export function sludgePuddleSheet(radius: number): SpriteSheetId {
  let best: SludgePuddleRadius = SLUDGE_PUDDLE_RADII[0];
  for (const r of SLUDGE_PUDDLE_RADII) if (r <= radius + 0.01) best = r;
  return SLUDGE_PUDDLE_SHEETS[best];
}

/**
 * Szlam Króla Szlamu (krok 152, `#krol-szlamu`): wygląd telegrafów, rozbryzgów, bąbli i szlamu na ścianach areny.
 * Czysto wizualne — zasięgi liczy `systems/Sludge.ts`. Paleta ze STYLEGUIDE §4.5.
 */
export const SLUDGE_FX = {
  /** Fiolet (deep → hl) i brąz szlamu — STYLEGUIDE §4.5. */
  purple: [0x1f1420, 0x3b2140, 0x5c3560, 0x83558a, 0xb88ab8],
  brown: [0x1e1510, 0x3a271c, 0x5a3e2a, 0x7e5b3e, 0xb08a64],
  glint: 0xe6cfe6,
  /** Telegraf strefy: fiolet zamiast czerwieni; pierścień zaciskający się do brzegu liliowy. */
  telegraph: { color: 0xa04ab0, edge: 0xd9a6e0, closing: 0xd9a6e0, fillAlpha: 0.16, progressAlpha: 0.3 },
  /** Znacznik lądowania flegmy i pierścień przed pierścieniem kul. */
  marker: { color: 0xb070c0, alpha: 0.6, fillAlpha: 0.22 },
  burstRing: { color: 0xc07ad0, width: 3 },
  /**
   * Arkusze rozbryzgu (px komórki) — gra składa z nich średnicę strefy: największy rozmiar × całkowita skala,
   * który nie wychodzi poza strefę o więcej niż `splashSlackPx` (rozbryzg pokazuje, kogo trafił).
   */
  splashSizes: [32, 64, 96, 112],
  splashSlackPx: 4,
  /** Krople szlamu wyrzucane przy rozbryzgu (spadają z grawitacją). */
  droplets: { perRadius: 0.35, max: 16, lifespanMs: { min: 380, max: 700 }, speed: { min: 60, max: 150 }, gravityY: 320 },
  /** Wstrząs przy rozbryzgu — słabszy niż ogień (szlam chlupie, nie wybucha). */
  shake: { durationMs: 110, perRadius: 0.00008, max: 0.004, min: 0.001 },
  soundGapMs: 110,
  /** Flegma w locie: wysokość łuku (px). */
  phlegm: { sheet: 'sludgePhlegm', animation: 'fly', arcHeight: 44 },
  /** Bąble na kałużach i szlamie przy ścianach: co ile ms jeden (na kałużę / na pas), losowo w zasięgu. */
  bubbles: { puddleEveryMs: 900, creepEveryMs: 160 },
  /** Szlam od ścian: lica murów pokrywają się zaciekami, a cała arena nabiera fioletu (normalne mieszanie). */
  creep: {
    /** Pas ciemniejszego wału przy brzegu szlamu (px) i szerokość przejścia Bayera fiolet → brąz (px). */
    rimPx: 2,
    ditherPx: 6,
    /** Zacieki na murach areny: ile kafli w głąb muru, długość zacieku przy pełnym szlamie (ułamek kafla). */
    wallTiles: 2,
    wallCover: 0.6,
    /** Najmniejsza zmiana głębokości (px), przy której przerysowujemy pas. */
    redrawStepPx: 1,
    /** Fioletowy odcień całej areny przy pełnym szlamie. */
    tint: { color: 0x5c2a6a, maxAlpha: 0.2 },
    /** Napis przy pierwszym wejściu w szlam. */
    text: { label: 'Szlam!', color: '#c890d8', minGapMs: 4000 },
  },
  quality: {
    pc: { maxSplashes: 24, maxBubbles: 40, particleScale: 1 },
    mobile: { maxSplashes: 12, maxBubbles: 16, particleScale: 0.5 },
  } satisfies Record<PlatformId, SludgeQuality>,
} as const;

export interface SludgeQuality {
  readonly maxSplashes: number;
  readonly maxBubbles: number;
  readonly particleScale: number;
}
