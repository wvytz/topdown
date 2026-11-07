import type { AmbushConfig } from '@/systems/Ambush';
import type { AmbushScenario } from '@/systems/AmbushWaves';
import { AmbushFormation as F } from '@/systems/AmbushWaves';

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
