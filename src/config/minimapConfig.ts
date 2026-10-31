/** Minimapa (krok 68): mgła wojny odkrywana w trakcie chodzenia, rysowana w prawym górnym rogu HUD. */
export const MINIMAP_CONFIG = {
  /** Promień odkrywania wokół gracza (kafle); odkrywa się tylko to, do czego da się dojść po podłodze. */
  revealRadius: 6,
  /** Rozmiar jednego kafla na minimapie (px ekranu). */
  tilePx: 3,
  /** Odstęp od prawej i górnej krawędzi ekranu. */
  marginPx: 12,
  /**
   * Półprzezroczystość (krok 147, uwaga właściciela: mapa zasłaniała grę): tło ledwie przyciemnia,
   * podłoga i ściany prześwitują — gra pod mapą zostaje czytelna.
   */
  background: { color: 0x000000, alpha: 0.18 },
  floorAlpha: 0.42,
  wallAlpha: 0.55,
  colors: {
    floor: 0x8a7f66,
    wall: 0x2a2630,
    stairs: 0xe7b140,
    boss: 0xc0392b,
    player: 0x3ddc84,
    /** Drugi gracz w co-opie (etap C5). */
    partner: 0x6ec6ff,
  },
  /** Gracz jest większy niż kafel, żeby było go widać. */
  playerPx: 5,
  /**
   * Podpowiedź drogi (krok 147): delikatna, płynąca smużka od gracza do areny bossa (po jego pokonaniu — do schodów).
   * Przez odkryte kafle widać ją całą, we mgle tylko kilka pierwszych kafli — kierunek, nie plan piętra.
   */
  route: {
    color: 0xf6e7a8,
    /** Jasność kafla trasy (tło smużki) i płynącej „iskry”. */
    trailAlpha: 0.3,
    sparkAlpha: 0.95,
    /** Co który kafel płynie iskra i ile ms trwa przeskok o kafel. */
    sparkEvery: 4,
    sparkStepMs: 110,
    /** Ile kafli trasy wolno pokazać we mgle (wygasają). */
    fogLeadTiles: 5,
    /** Najdłuższa liczona trasa (kafle). */
    maxTiles: 400,
  },
} as const;
