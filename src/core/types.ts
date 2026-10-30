import type { InputRecording } from '@/core/diagnosticsTypes';
import type { HeroId } from '@/core/heroTypes';
import type { RunMode } from '@/core/runMode';
/** Czyste typy domenowe — bez zależności od Phasera. */
import type { RunSnapshot } from '@/core/lootTypes';
import type { ScoreboardView } from '@/systems/Highscores';
import type { ItemId } from '@/core/lootTypes';
import type { PlayerDevices } from '@/systems/coopDevices';

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

/** Znormalizowany stan wejścia ruchu w danej klatce (-1..1 na każdej osi). */
export interface MovementIntent {
  readonly x: number;
  readonly y: number;
}

export interface MovementStats {
  /** Prędkość maksymalna w px/s. */
  readonly moveSpeed: number;
}

export interface PlayerStats extends MovementStats {
  readonly maxHp: number;
}

export enum SceneKey {
  Splash = 'SplashScene',
  Menu = 'MenuScene',
  Select = 'HeroSelectScene',
  Boot = 'BootScene',
  Game = 'GameScene',
  Hud = 'HudScene',
  Reward = 'RewardScene',
  Pause = 'PauseScene',
  /** Ekran co-opu (etap C5): dołączanie i wybór bohaterów. */
  CoopSelect = 'CoopSelectScene',
}

export enum TextureKey {
  Projectile = 'tex-projectile',
}

/** Dane przekazywane przy (re)starcie GameScene. */
/** Start ekranu wyboru bohatera (krok 38): seed i piętro nowego runu, zaznaczony bohater. */
export interface HeroSelectData {
  readonly runSeed: number;
  readonly floor: number;
  /** Bohater zaznaczony na starcie (np. po śmierci); brak = ostatnio wybrany. */
  readonly preselect?: HeroId;
  /** Run testowy z adresu (krok 41g). */
  readonly practice?: boolean;
  /** Tryb zaznaczony na starcie (krok 90); brak = wspinaczka. */
  readonly mode?: RunMode;
}

/** Ekran co-opu (etap C5): tylko wspinaczka od piętra 1. */
export interface CoopSelectData {
  readonly runSeed: number;
  readonly practice?: boolean;
}

export interface FloorSceneData {
  readonly runSeed: number;
  readonly floor: number;
  /** Złoto, przedmioty i HP przenoszone z poprzedniego piętra. */
  readonly run: RunSnapshot;
  /** Odtworzenie nagrania wejść (krok 56, tylko tryb dev): wejścia z nagrania zamiast klawiatury. */
  readonly replay?: InputRecording;
  /** Start tuż przy wejściu na arenę bossa (`?boss=1`, tylko pierwsze piętro runu testowego). */
  readonly atBoss?: boolean;
  /** Lokalny co-op (krok 101+): drugi bohater i urządzenia graczy; brak = gra solo. */
  readonly coop?: CoopSceneData;
}

/** Drugi bohater w co-opie przenoszony między piętrami (pierwszy jest w `run`). */
export interface CoopPartnerSnapshot {
  readonly hero: HeroId;
  /** Przedmioty partnera (decyzja właściciela: każdy zbiera dla siebie). */
  readonly items: readonly ItemId[];
  /** null = pełne HP. */
  readonly hp: number | null;
}

export interface CoopSceneData {
  readonly partner: CoopPartnerSnapshot;
  /** Urządzenia graczy w kolejności P1, P2. */
  readonly devices: readonly PlayerDevices[];
}

/** Promień Czarodziejki w HUD: świeci (pasek = pozostały czas) albo odnawia się po zgaśnięciu. */
export interface BeamHudData {
  readonly active: boolean;
  /** 0..1: w trakcie promienia — ile zostało z limitu; poza nim — postęp odnowienia (1 = gotowy). */
  readonly readiness: number;
}

/** Pasek mocy ultimate (R, krok 98). */
export interface UltimateHudData {
  /** 0..1, 1 = gotowe. */
  readonly charge: number;
  /** Ultimate właśnie działa. */
  readonly active: boolean;
  readonly name: string;
}

export interface HudData {
  readonly floor: number;
  /** Areny bossów (krok 90): napis areny zamiast piętra; null we wspinaczce. */
  readonly arenaLabel: string | null;
  /** Modyfikator bieżącego piętra; null na piętrach bez modyfikatora. */
  readonly floorModifier: { readonly name: string; readonly description: string } | null;
  readonly hp: number;
  readonly maxHp: number;
  /** 0..1, 1 = dash gotowy. */
  readonly dashReadiness: number;
  /** Ładunki strzału (PPM). */
  readonly ranged: RangedHudData;
  /** Promień Czarodziejki; null u barbarzyńcy. */
  readonly beam: BeamHudData | null;
  /** Ultimate (krok 98); null, zanim powstanie gracz. */
  readonly ultimate: UltimateHudData | null;
  readonly enemiesAlive: number;
  readonly stairsUnlocked: boolean;
  /** Gracz stoi na otwartych schodach — wejście wyżej klawiszem E (krok 47). */
  readonly onStairs: boolean;
  /** E (interakcja) coś teraz zrobi: otwarte schody pod bohaterem albo kapliczka, na którą go stać (krok 96 — przycisk E na dotyku). */
  readonly canInteract: boolean;
  readonly isPlayerDead: boolean;
  /** Minimapa bieżącego piętra (krok 68); null, zanim piętro powstanie. */
  readonly minimap: MinimapHudData | null;
  /** null, gdy walka z bossem nie trwa. */
  readonly boss: BossHudData | null;
  /** Bossowie poza kadrem (krok 136): strzałki przy krawędzi ekranu. */
  readonly bossPointers: readonly BossPointerData[];
  readonly gold: number;
  /** Run testowy z adresu (krok 41g) — wynik nie trafia na tablicę. */
  readonly practice: boolean;
  /** Areny bossów (krok 90) — wynik nie trafia na tablicę. */
  readonly bossRush: boolean;
  readonly items: readonly HudItem[];
  /** Ostatni komunikat (np. zdobyty przedmiot); null, gdy nic do pokazania. */
  readonly toast: HudToast | null;
  /** Ostatnio zdobyty przedmiot (podniesiony, z kapliczki, nagroda za bossa); null, gdy nic do pokazania. */
  readonly itemNotice: HudItemNotice | null;
  /** Podsumowanie runu po śmierci; null, dopóki gracz żyje. */
  readonly death: DeathSummary | null;
  /** Co-op (etap C5): napis przy pasku P1 („P1 · Barbarzyńca”); pusto w grze solo. */
  readonly playerLabel: string;
  /** Co-op (etap C5): panel drugiego gracza; null w grze solo. */
  readonly partner: HudPartnerData | null;
}

/** Panel drugiego gracza w HUD (co-op, etap C5). */
export interface HudPartnerData {
  readonly label: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly dashReadiness: number;
  readonly ultimate: UltimateHudData | null;
  /** Powalony — czeka na wskrzeszenie; `reviveProgress` 0..1. */
  readonly downed: boolean;
  readonly reviveProgress: number;
  readonly items: readonly HudItem[];
}

/** Dane minimapy: mgła wojny (współdzielona, mutowana przez scenę gry) i pozycje znaczników w kaflach. */
export interface MinimapHudData {
  readonly explorer: import('@/systems/Minimap').MinimapExplorer;
  readonly player: { readonly x: number; readonly y: number };
  /** Co-op: kafel drugiego gracza; null w grze solo. */
  readonly partner: { readonly x: number; readonly y: number } | null;
  readonly stairs: { readonly x: number; readonly y: number };
  /** Środek areny bossa; null po jego pokonaniu (znacznik znika). */
  readonly boss: { readonly x: number; readonly y: number } | null;
}

export interface RangedHudData {
  readonly charges: number;
  readonly maxCharges: number;
  /** 0..1 postęp kolejnego ładunku; 1, gdy wszystkie są gotowe. */
  readonly rechargeProgress: number;
}

export interface DeathSummary {
  readonly score: number;
  readonly floor: number;
  readonly rank: number;
  readonly board: ScoreboardView;
  /** Skąd tablica: lokalna, wspólna albo lokalna w oczekiwaniu na wspólną. */
  readonly source: 'local' | 'pending' | 'shared' | 'practice' | 'fromSave' | 'floorSelect';
  /** Śmierć w arenach bossów (krok 91a): tablica aren — `floor` to arena, ranking najpierw arena, potem złoto. */
  readonly arenas?: boolean;
  /** Co-op (etap C7): wynik drużyny na tablicy co-op. */
  readonly coop?: boolean;
  /** Imię w trakcie wpisywania; null, gdy panel pokazuje już tablicę. */
  readonly nameEntry: string | null;
}

export interface HudItem {
  readonly name: string;
  readonly count: number;
  readonly color: number;
  /** Klatka ikony w atlasie łupów (krok 67: ikony zamiast tekstu). */
  readonly frame: string;
  /** Rzadszy przedmiot z efektem broni — złota ramka zamiast kościanej. */
  readonly rare: boolean;
}

/** Nazwa i efekt świeżo zdobytego przedmiotu — HUD pokazuje je pod ikonami i wygasza. */
export interface HudItemNotice {
  readonly name: string;
  readonly effect: string;
  readonly remainingMs: number;
}

export interface HudToast {
  readonly text: string;
  /** Ile ms komunikat będzie jeszcze widoczny (HUD na tej podstawie go wygasza). */
  readonly remainingMs: number;
}

export interface BossHudData {
  readonly name: string;
  /** Tytuł na planszy otwierającej walkę (null = bez planszy). */
  readonly title: string | null;
  /** Dopisek przy imieniu po wściekłości. */
  readonly enragedLabel: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly enraged: boolean;
  /** Duet (krok 136): osobny pasek każdego bossa; brak = jeden pasek. */
  readonly members?: readonly BossBarData[];
}

/** Pasek jednego bossa duetu (krok 136). */
export interface BossBarData {
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly enraged: boolean;
  readonly defeated: boolean;
}

/** Strzałka przy krawędzi ekranu do bossa poza kadrem (krok 136), w pikselach ekranu. */
export interface BossPointerData {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

/** HUD czyta stan co klatkę z tego źródła (zamiast zdarzeń przy każdej zmianie). */
export interface HudSource {
  getHudData(): HudData;
}

export interface HudSceneData {
  readonly source: HudSource;
}
