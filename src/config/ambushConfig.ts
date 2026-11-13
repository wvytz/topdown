import type { AmbushConfig } from '@/systems/Ambush';
import type { AmbushScenario } from '@/systems/AmbushWaves';
import { AmbushFormation as F } from '@/systems/AmbushWaves';
import { ItemId } from '@/core/lootTypes';
import { AmbushVariant, type AmbushVariantsConfig, BossBoon } from '@/systems/AmbushVariants';

/**
 * Zasadzki (krok 49, pomysł właściciela): co 1–2 piętra pusty pokój z przedmiotem na środku. Wejście w głąb:
 * kraty, mrok, dwie fale upiorów. To wydarzenie, nie zwykły pokój — fale są liczniejsze niż 1–2 wrogów na pokój.
 */
export const AMBUSH_CONFIG: AmbushConfig = {
  firstFloor: { min: 1, max: 2 },
  gap: { min: 1, max: 2 },
  // Krok 49b (właściciel): zwykle pokój o krótszym boku 7 kratek, czasem 6.
  minSide: 6,
  preferredSide: 7,
  preferredChance: 0.8,
  triggerMargin: 2,
  // Krok 49a: więcej, ale słabszych upiorów — intensywnie, z niskim ryzykiem. Fale od kroku 164: AMBUSH_SCENARIOS.
  waveDelayMs: 1100,
  riseMs: 900,
  minSpawnDistance: 3,
  // Krok 50a (właściciel): upiory rosną wolno — na piętrze 9 ok. 28 HP i 5 obrażeń (zwykli wrogowie: +120% / +80%).
  ghostScaling: { hpPerFloor: 0.05, damagePerFloor: 0.03 },
  // Mrok: gracz widzi tylko ok. 1,5 kafla wyraźnie, dalej szybko ciemno; upiory świecą nad mrokiem.
  dread: { profile: { fullLightRadius: 40, edgeRadius: 120, maxDarkness: 0.86 }, fadeMs: 900 },
};

/**
 * Krok 164 (uwaga testera: „pokój z upiorami szybko się nudzi”): ręcznie ułożone scenariusze — 3 fale w różnych
 * szykach. Upiorów w sumie ok. 14 (wcześniej 9), ale fale krótkie; elita to Szybki upiór, „mobs” — wrogowie biomu
 * z normalnym łupem. Zasadzka dalej ma być „jackpotem, nie kłopotem” (krok 50a): upiory słabe, mobów najwyżej 2.
 */
export const AMBUSH_SCENARIOS: readonly AmbushScenario[] = [
  { name: 'Krąg', waves: [{ formation: F.Scatter, ghosts: 4 }, { formation: F.Ring, ghosts: 6 }, { formation: F.Corners, ghosts: 4, elite: true }] },
  { name: 'Ściana', waves: [{ formation: F.Wall, ghosts: 5 }, { formation: F.Wall, ghosts: 5 }, { formation: F.Scatter, ghosts: 3, mobs: 2 }] },
  { name: 'Kleszcze', waves: [{ formation: F.Pincer, ghosts: 4 }, { formation: F.Ring, ghosts: 5 }, { formation: F.Pincer, ghosts: 5, elite: true }] },
  { name: 'Z kątów', waves: [{ formation: F.Corners, ghosts: 4 }, { formation: F.Corners, ghosts: 4, mobs: 1 }, { formation: F.Ring, ghosts: 6 }] },
  { name: 'Nawała', waves: [{ formation: F.Scatter, ghosts: 3 }, { formation: F.Scatter, ghosts: 5 }, { formation: F.Ring, ghosts: 7 }] },
  { name: 'Straż', waves: [{ formation: F.Ring, ghosts: 4, elite: true }, { formation: F.Wall, ghosts: 5 }, { formation: F.Pincer, ghosts: 6 }] },
];

/** Napis fali: „Fala 2/3 — pierścień!”. */
export const AMBUSH_FORMATION_TEXT: Readonly<Record<F, string>> = {
  [F.Scatter]: 'wynurzają się wszędzie',
  [F.Ring]: 'otaczają cię!',
  [F.Wall]: 'szereg spod ściany',
  [F.Pincer]: 'kleszcze z obu stron',
  [F.Corners]: 'z czterech kątów',
};

/**
 * Krok 183 (projekt właściciela, uwagi testerów: „każda zasadzka taka sama”): trzy wersje zasadzki po równo.
 * Butla dżina — kaskada fal; Uciekinier — przedmiot wzmacnia bossa, a po nim wypada dodatkowo; Zaduch — mrok,
 * splątanie, eteryczne strzały i wielki duch (wariant `EnemyVariant.GreatGhost`).
 */
export const AMBUSH_VARIANTS: AmbushVariantsConfig = {
  weights: { [AmbushVariant.Storm]: 1, [AmbushVariant.Flight]: 1, [AmbushVariant.Haunt]: 1 },
  baitMargin: 1,
  baitEntranceGap: 2,
  storm: { cascadeMs: 1400, staggerMs: 90, streakMs: 260, extraGhosts: 1 },
  flight: {
    glowMs: 1500,
    speed: 170,
    boonOf: {
      [ItemId.Heart]: BossBoon.Vitality,
      [ItemId.VampireFang]: BossBoon.Vitality,
      [ItemId.Boots]: BossBoon.Swiftness,
      [ItemId.Hourglass]: BossBoon.Swiftness,
      [ItemId.StormDash]: BossBoon.Swiftness,
      [ItemId.Quiver]: BossBoon.Swiftness,
      [ItemId.Blade]: BossBoon.Might,
      [ItemId.Gloves]: BossBoon.Might,
      [ItemId.Shuriken]: BossBoon.Might,
      [ItemId.ElectricArrow]: BossBoon.Might,
      [ItemId.FireFist]: BossBoon.Might,
      [ItemId.FrostShard]: BossBoon.Might,
      [ItemId.SlimeCrown]: BossBoon.Vitality,
      [ItemId.SpiderSilk]: BossBoon.Vitality,
      [ItemId.DevourerTooth]: BossBoon.Vitality,
      [ItemId.HeadsmanAxe]: BossBoon.Vitality,
      [ItemId.BaronPipe]: BossBoon.Vitality,
      [ItemId.WetMop]: BossBoon.Vitality,
      [ItemId.StorkFeather]: BossBoon.Vitality,
    },
    boons: {
      [BossBoon.Vitality]: { hpMultiplier: 1.3, damageMultiplier: 1, speedMultiplier: 1, label: '+30% życia' },
      [BossBoon.Swiftness]: { hpMultiplier: 1, damageMultiplier: 1, speedMultiplier: 1.2, label: '+20% szybkości' },
      [BossBoon.Might]: { hpMultiplier: 1, damageMultiplier: 1.25, speedMultiplier: 1, label: '+25% obrażeń' },
    },
    rewardGold: 30,
  },
  haunt: {
    dread: { fullLightRadius: 26, edgeRadius: 92, maxDarkness: 0.95 },
    darkenMs: 1300,
    entangleSlowPct: 0.4,
    volleys: [2, 3, 3, 4],
    volleyGapMs: 1900,
    telegraphMs: 1200,
    launchStaggerMs: 260,
    edgeRadius: 84,
    dartSpeed: 210,
    overshoot: 120,
    damage: 6,
    hitRadius: 14,
    knockback: 120,
    ribbonMs: 1800,
    giantVolleyMs: 3200,
    giantVolley: 2,
  },
};

/**
 * Krok U5c (decyzja właściciela 13.11.2026: „ten room miał pełnić funkcję zaskoczenia, nie musimy tłumaczyć graczom,
 * co się dzieje”): zasadzka nie wyświetla napisów — ani fal, ani wersji, ani nagrody. `true` przywraca napisy poniżej.
 */
export const AMBUSH_ANNOUNCE = false;

/** Napisy wersji zasadzki (toast przy zamknięciu krat / ucieczce) — tylko przy `AMBUSH_ANNOUNCE`. */
export const AMBUSH_VARIANT_TEXT = {
  storm: 'Butla dżina pękła! Upiory wylatują…',
  flightGlow: 'Przedmiot lśni duchową aurą…',
  flight: (item: string) => `${item} ucieka do bossa!`,
  flightArrive: (boss: string, item: string, label: string) => `${boss} wchłonął: ${item} (${label}). Pokonaj go — przedmiot wypadnie.`,
  haunt: 'Zaduch… Splątanie spowalnia czas.',
  hauntArrows: 'Rozbij eteryczne strzały w locie!',
  hauntRibbon: 'Wstęga prowadzi w głąb — coś tam czeka.',
  hauntGiant: 'Zaduch — upiór szybu!',
} as const;
