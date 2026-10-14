/**
 * Głębokości rysowania (depth w Phaserze) — jedno źródło prawdy dla całej sceny gry.
 * Tło (0–4) < rozgrywka (5–12) < elementy nad postaciami (13) < światło i mrok (14–15) < napisy w świecie.
 */
export const RENDER_DEPTH = {
  // Tło: warstwy z FloorDressing.
  floorBase: 0,
  floorDecal: 0.5,
  floorFeature: 1,
  /** Trwałe ślady walki: nad nakładkami i schodami, pod cieniami (mur nadal je przyciemnia). */
  combatDecal: 1.5,
  /** Lepkie pajęczyny na podłodze (krok 23e): element rozgrywki, nad śladami walki, pod cieniami. */
  floorHazard: 1.6,
  envShadow: 2,
  /** Cień pod chodzącą postacią (rysowany przez silnik, STYLEGUIDE §6). */
  actorShadow: 2.5,
  walls: 3,
  /** Uchwyty pochodni na licach murów. */
  wallDecor: 3.2,
  /** Kraty na wejściach do areny stoją między ścianami. */
  gates: 3.5,

  // Rozgrywka.
  telegraph: 5,
  groundFlash: 6,
  shrine: 6,
  coin: 7,
  item: 8,
  deathBurst: 8,
  enemy: 9,
  boss: 9,
  player: 10,
  aimMarker: 11,
  projectile: 11,
  slash: 12,

  /** Mury z podłogą od północy (kopie z warstwy ścian): postać stoi „za” nimi. */
  overhead: 13,
  /** Łuki nad przejściami i pajęczyny — dekoracje nad postaciami, bez kolizji. */
  overheadDecor: 13.2,
  /** Pyłki w powietrzu: pod warstwą mroku (gasną na krawędziach), pod poświatą pochodni. */
  motes: 14,
  /** Dryfujące obłoczki mgły (Grzybnia, krok 28a): nad postaciami, pod warstwą mgły. */
  fogWisps: 14.5,
  /** Warstwa mroku i świateł (LightingOverlay); przy modyfikatorze „Mrok” prawie nieprzezroczysta. */
  darkness: 15,
  /** Ciepła poświata pochodni (mieszanie ADD) i same płomienie — świecą, więc nad mrokiem. */
  torchGlow: 15.5,
  torchFlame: 15.6,
  worldText: 20,
} as const;
