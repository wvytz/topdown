import type { BossDuetDefinition } from '@/systems/BossDuet';

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

/**
 * Duety bossów w arenach (krok 112, pomysł właściciela — utrudnienie): arena Króla Pająków (3. w kręgu)
 * dostaje też Matkę Pająków; walczą naraz, każdy z pełnym HP. We wspinaczce bez zmian.
 */
export const BOSS_RUSH_DUETS: readonly BossDuetDefinition[] = [
  {
    floorInLoop: 3,
    partnerFloorInLoop: 2,
    spawnOffsetTiles: 2.5,
    bodyGapPx: 4,
    hpMultiplier: 1,
    // Dwie świty naraz to za dużo tłoku na arenie — przywołuje tylko Król (zarażone pająki).
    partnerRetinue: false,
    name: 'Matka i Król Pająków',
    title: 'Pajęczy duet',
  },
];

/** Napisy trybu (HUD, ekran wyboru, ekran śmierci). */
export const BOSS_RUSH_TEXT = {
  modeName: 'ARENY BOSSÓW',
  towerModeName: 'WSPINACZKA',
  /** Dopisek przy nazwie trybu na ekranie wyboru. */
  testBadge: 'TEST',
  modeHint: 'same areny bossów, nagroda co arenę · osobna tablica wyników aren',
  towerModeHint: 'piętra wieży, boss na końcu każdego',
  startToast: 'Areny bossów — wynik trafi na tablicę aren',
  clearToast: 'Pokonaj pozostałych przeciwników!',
  teleportToast: 'Teleport na kolejną arenę…',
  fightHint: 'Pokonaj bossa i jego pomocników · unikaj czerwonych stref',
  arenaHint: 'po bossie i pomocnikach — nagroda i teleport na kolejną arenę',
  goldSuffix: '(tablica aren: arena, potem złoto)',
  /** R zaczyna areny od nowa tym samym bohaterem, C wraca do ekranu wyboru (z zaznaczonym trybem aren). */
  deathPrompt: 'R — ARENY OD NOWA · C — ZMIANA BOHATERA · M — MENU',
  /** Nagłówki tablicy aren (krok 91a) — jak tablicy wspinaczki, zależnie od źródła wyników. */
  boardHeaders: {
    local: 'NAJLEPSZE ARENY',
    pending: 'NAJLEPSZE ARENY · ŁĄCZENIE…',
    shared: 'NAJLEPSZE ARENY · WSZYSCY GRACZE',
  },
} as const;
