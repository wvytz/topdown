import type { ItemEvolutionConfig } from '@/core/lootTypes';
import { ItemId } from '@/core/lootTypes';

/**
 * Przemiany przedmiotów (krok 150, `#decyzja` właściciela „trzy kopie to przemiana”): kopie 1–2 wzmacniają liczbę,
 * 3. kopia zmienia mechanikę, bez nowych przycisków (pad, telefon i co-op bez zmian). Przedmiot z `maxCopies`
 * po przemianie nie trafia już na karty ani do kapliczki (zasada z kroku 117).
 *
 * Balans na liczbach po kroku 145: cios barbarzyńcy ok. 47 obrażeń/s, łucznik ok. 37/s. Przemiana ma dawać
 * ok. +20–30% siły albo wyraźnie ułatwiać jedną rzecz — liczby do strojenia w testach właściciela.
 */
export const ITEM_EVOLUTION: ItemEvolutionConfig = {
  copies: 3,
  items: {
    [ItemId.Blade]: {
      name: 'Fala ostrza',
      effect: 'co 3. atak wypuszcza falę ostrza, która leci przez wszystkich wrogów',
      after: '+3 obrażeń (też fali)',
    },
    // Decyzja właściciela: „napompowane serce” — przemieniająca kopia daje podwójne HP.
    [ItemId.Heart]: {
      name: 'Napompowane serce',
      effect: 'ta kopia daje +40 maks. HP zamiast +20',
      after: '+20 maks. HP',
    },
    // Buty: lewitacja z kroku 150 cofnięta w kroku 151 (`#decyzja` właściciela: „niedopuszczalne” — wyłączała
    // pułapki i plamy pięciu bossów). Przemiana Butów czeka na nowy pomysł; do tego czasu działają jak przed
    // krokiem 150 (+10% prędkości za kopię, do limitu STAT_LIMITS.maxMoveSpeedMultiplier).
    [ItemId.Gloves]: {
      name: 'Rozpęd',
      effect: 'ciągły atak przyspiesza o kolejne +24%; przerwa w ataku zeruje rozpęd',
      maxCopies: 3,
    },
    [ItemId.Hourglass]: {
      name: 'Pętla czasu',
      effect: 'dash ma 2 ładunki — dwa zrywy jeden po drugim',
      maxCopies: 3,
    },
    [ItemId.Shuriken]: {
      name: 'Rykoszet',
      effect: 'strzał odbija się od ścian 2 razy zamiast się rozbić',
      after: '+1 przebicie i +1 odbicie (do 4)',
    },
    [ItemId.ElectricArrow]: {
      name: 'Iskrownik',
      effect: 'kula przy ramieniu sama razi piorunem najbliższego wroga co 0,8 s',
      after: 'Iskrownik strzela o 0,1 s szybciej (do 0,5 s)',
    },
    [ItemId.FireFist]: {
      name: 'Pożoga',
      effect: 'płonący wróg wybucha przy śmierci i podpala sąsiadów',
      after: 'mocniejsze podpalenie i wybuch',
    },
    [ItemId.Quiver]: {
      name: 'Kołczan bez dna',
      effect: 'ładunki wracają 2× szybciej, a strzał z ładunku leci podwójnie (Czarodziejka: +1 kula)',
      maxCopies: 3,
    },
    [ItemId.VampireFang]: {
      name: 'Krwawa tarcza',
      effect: 'leczenie przy pełnym HP buduje tarczę do 15% bazowego HP',
      maxCopies: 3,
    },
    [ItemId.StormDash]: {
      name: 'Ślad burzy',
      effect: 'dash zostawia na 1,5 s ślad błyskawic, który rani wrogów',
      after: '+6 obrażeń dasha i śladu',
    },
    [ItemId.FrostShard]: {
      name: 'Zamrożenie',
      effect: 'trafienie spowolnionego wroga zamraża go na 1 s; zamrożony pęka przy śmierci i spowalnia sąsiadów',
      maxCopies: 3,
    },
  },
  heart: { bonusMaxHp: 20 },
  // Elektryczna strzała od 1. kopii: piorun przeskakuje z trafionego na 1 sąsiada (2. kopia — na 2).
  chain: { range: 60, damageFraction: 0.4, targetsPerCopy: 1, maxTargets: 2 },
  // Ok. 10 obrażeń/s w jeden cel (ok. 25% ostrzału łucznika) i więcej w tłumie; bije bossa pełną siłą.
  sparker: { intervalMs: 800, intervalStepMs: 100, minIntervalMs: 500, range: 160, damage: 8, chains: 2, chainRange: 70 },
  // Co 3. atak: fala ok. 135 px (300 px/s × 0,45 s), 75% obrażeń ataku, przebija wszystkich.
  bladeWave: { every: 3, damageFraction: 0.75, speed: 300, lifetimeMs: 450, radius: 7, knockback: 120 },
  // 3 stopnie po 8%: z trzema Rękawicami (+36%) rozpęd dochodzi do limitu +60% tempa (STAT_LIMITS).
  attackRamp: { stepPct: 0.08, steps: 3, stepEveryMs: 600, resetAfterMs: 700 },
  hourglass: { dashCharges: 2 },
  ricochet: { bounces: 2, perStack: 1, max: 4, extraLifetimeMs: 250 },
  pyre: { radius: 32, damage: 12, damagePerStack: 3 },
  quiver: { rechargeMultiplier: 0.5, twinSpreadDeg: 8, extraOrbs: 1, extraVolleyArrows: 2 },
  bloodShield: { maxBaseHpPct: 0.15 },
  stormTrail: { durationMs: 1500, tickMs: 250, radius: 10, damageFraction: 0.35, spacing: 10 },
  frost: { freezeMs: 1000, shatterRadius: 40, shatterSlow: { pct: 0.5, durationMs: 1500 } },
};

/** Wygląd przemian (krok 150) — figury geometryczne do czasu arkuszy z generatora; czysto wizualne. */
export const EVOLUTION_VISUAL = {
  /** Piorun: zygzak z `segments` odcinków, odchylenie do `jitter` px, gaśnie przez `fadeMs`. */
  bolt: { segments: 6, jitter: 5, fadeMs: 140, outer: 0x6ec6ff, inner: 0xfffbe0, outerWidth: 3, innerWidth: 1 },
  /** Kula Iskrownika nad ramieniem: krąży po elipsie wokół punktu nad bohaterem. */
  sparker: { offsetY: -20, orbitX: 9, orbitY: 3, periodMs: 1400, radius: 3, glowRadius: 6, color: 0xfff06a, glow: 0x6ec6ff },
  /** Fala ostrza: półksiężyc w teksturze 20×20. */
  crescent: { key: 'evo-crescent', size: 20, color: 0xe8f4ff, edge: 0x8fc8ff },
  /** Krwawa tarcza: pierścień wokół bohatera, grubszy przy pełnej tarczy. */
  bloodShield: { radius: 15, color: 0xff3a5a, alpha: 0.7 },
  /** Ślad burzy: migoczące odcinki między punktami śladu. */
  stormTrail: { color: 0x9a86ff, core: 0xe6e0ff, width: 3 },
  /** Wybuch Pożogi i pęknięcie lodu. */
  pyreColor: 0xff7a2a,
  shatterColor: 0xbff4ff,
} as const;
