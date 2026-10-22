/**
 * Areny bossów (krok 90, tryb testowy): gracz trafia od razu na arenę bossa, po zwycięstwie i oczyszczeniu
 * areny wybiera 1 z kart przedmiotów i teleportuje się na kolejną arenę. Arena N to arena bossa piętra N
 * (te same biomy, bossowie i skalowanie co we wspinaczce, także w kolejnych kręgach).
 */
export const BOSS_RUSH_CONFIG = {
  /** Parametr adresu, który od razu wybiera ten tryb (`?mode=arenas`). */
  urlParam: 'mode',
  urlValue: 'arenas',
  /** Od wyboru karty do teleportu (ms) — czas na zebranie łupu z bossa; to, co zostanie, trafia do gracza samo. */
  teleportDelayMs: 2000,
  /** Wygaszenie ekranu przy teleporcie (ms) i jego kolor. */
  teleportFadeMs: 400,
  teleportFadeColor: { r: 70, g: 40, b: 120 },
} as const;

/** Napisy trybu (HUD, ekran wyboru, ekran śmierci). */
export const BOSS_RUSH_TEXT = {
  modeName: 'ARENY BOSSÓW',
  towerModeName: 'WSPINACZKA',
  /** Dopisek przy nazwie trybu na ekranie wyboru. */
  testBadge: 'TEST',
  modeHint: 'same areny bossów, nagroda co arenę · wynik nie trafia na tablicę',
  towerModeHint: 'piętra wieży, boss na końcu każdego',
  startToast: 'Areny bossów — wynik nie trafi na tablicę',
  clearToast: 'Pokonaj pozostałych przeciwników!',
  teleportToast: 'Teleport na kolejną arenę…',
  fightHint: 'Pokonaj bossa i jego pomocników · unikaj czerwonych stref',
  arenaHint: 'po bossie i pomocnikach — nagroda i teleport na kolejną arenę',
  goldSuffix: '(areny bossów — bez wyniku)',
  /** R zaczyna areny od nowa tym samym bohaterem, C wraca do ekranu wyboru (z zaznaczonym trybem aren). */
  deathPrompt: 'R — ARENY OD NOWA · C — ZMIANA BOHATERA · M — MENU',
  deathHeader: 'ARENY BOSSÓW — WYNIK NIE TRAFIA NA TABLICĘ',
} as const;
