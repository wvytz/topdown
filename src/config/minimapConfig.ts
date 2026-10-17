/** Minimapa (krok 68): mgła wojny odkrywana w trakcie chodzenia, rysowana w prawym górnym rogu HUD. */
export const MINIMAP_CONFIG = {
  /** Promień odkrywania wokół gracza (kafle); odkrywa się tylko to, do czego da się dojść po podłodze. */
  revealRadius: 6,
  /** Rozmiar jednego kafla na minimapie (px ekranu). */
  tilePx: 3,
  /** Odstęp od prawej i górnej krawędzi ekranu. */
  marginPx: 12,
  background: { color: 0x000000, alpha: 0.55 },
  colors: {
    floor: 0x8a7f66,
    wall: 0x2a2630,
    stairs: 0xe7b140,
    boss: 0xc0392b,
    player: 0x3ddc84,
  },
  /** Gracz jest większy niż kafel, żeby było go widać. */
  playerPx: 5,
} as const;
