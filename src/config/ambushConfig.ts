import type { AmbushConfig } from '@/systems/Ambush';

/**
 * Zasadzki (krok 49, pomysł właściciela): co 1–2 piętra pusty pokój z przedmiotem na środku. Wejście w głąb:
 * kraty, mrok, dwie fale upiorów. To wydarzenie, nie zwykły pokój — fale są liczniejsze niż 1–2 wrogów na pokój.
 */
export const AMBUSH_CONFIG: AmbushConfig = {
  firstFloor: { min: 1, max: 2 },
  gap: { min: 1, max: 2 },
  minSide: 6,
  triggerMargin: 2,
  // Krok 49a: więcej, ale słabszych upiorów — intensywnie, z niskim ryzykiem.
  waves: [4, 5],
  waveDelayMs: 1100,
  riseMs: 900,
  minSpawnDistance: 3,
  // Mrok: gracz widzi tylko ok. 1,5 kafla wyraźnie, dalej szybko ciemno; upiory świecą nad mrokiem.
  dread: { profile: { fullLightRadius: 40, edgeRadius: 120, maxDarkness: 0.86 }, fadeMs: 900 },
};
