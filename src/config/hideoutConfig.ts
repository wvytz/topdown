import type { TilePoint } from '@/core/dungeonTypes';

/** Stanowiska Popielnika (Akt II, krok Z1; `docs/AKT2.md` §3). */
export enum HideoutStation {
  /** Palenisko na środku — serce kryjówki; stan profilu (Żar, ranga). */
  Hearth = 'hearth',
  /** Brama Zejścia: run w dół, solo. */
  Gate = 'gate',
  /** Brama Zejścia we dwoje (lokalny co-op). */
  GateCoop = 'gate-coop',
  /** Szyb w górę: zwykła wspinaczka Aktu I. */
  Shaft = 'shaft',
  /** Popielne lustro: areny bossów. */
  Mirror = 'mirror',
  /** Piec wotów: wypalanie Wot za Żar (etap Z3 — na razie zimny). */
  Kiln = 'kiln',
  /** Ściana imion: rekordy Zejścia. */
  Wall = 'wall',
  /** Półka trofeów po pokonanych bossach. */
  Shelf = 'shelf',
}

export interface HideoutStationSpot {
  readonly id: HideoutStation;
  /** Kafel stanowiska; Szyb zajmuje blok schodów od tego kafla. */
  readonly tile: TilePoint;
  readonly name: string;
  /** Co zrobi interakcja; null — stanowisko tylko do obejrzenia. */
  readonly prompt: string | null;
}

export interface HideoutConfig {
  readonly widthTiles: number;
  readonly heightTiles: number;
  /** Środek i półosie owalnej komory (kafle). */
  readonly center: { readonly x: number; readonly y: number };
  readonly radius: { readonly x: number; readonly y: number };
  readonly spawn: TilePoint;
  readonly stations: readonly HideoutStationSpot[];
  /** Z jakiej odległości (kafle, środek–środek) działa interakcja. */
  readonly reachTiles: number;
}

export const HIDEOUT_CONFIG: HideoutConfig = {
  widthTiles: 31,
  heightTiles: 23,
  center: { x: 15, y: 11 },
  radius: { x: 10.6, y: 7.2 },
  spawn: { x: 15, y: 13 },
  reachTiles: 1.6,
  stations: [
    { id: HideoutStation.Hearth, tile: { x: 15, y: 11 }, name: 'Palenisko', prompt: null },
    { id: HideoutStation.Shaft, tile: { x: 14, y: 5 }, name: 'Szyb w górę', prompt: 'Wspinaczka na wieżę' },
    { id: HideoutStation.Gate, tile: { x: 12, y: 17 }, name: 'Brama Zejścia', prompt: 'Zejdź sam' },
    { id: HideoutStation.GateCoop, tile: { x: 18, y: 17 }, name: 'Brama we dwoje', prompt: 'Zejdźcie we dwoje' },
    { id: HideoutStation.Mirror, tile: { x: 6, y: 11 }, name: 'Popielne lustro', prompt: 'Areny bossów' },
    { id: HideoutStation.Kiln, tile: { x: 24, y: 11 }, name: 'Piec wotów', prompt: 'Zajrzyj do pieca' },
    { id: HideoutStation.Wall, tile: { x: 9, y: 7 }, name: 'Ściana imion', prompt: 'Czytaj' },
    { id: HideoutStation.Shelf, tile: { x: 21, y: 7 }, name: 'Półka trofeów', prompt: 'Obejrzyj' },
  ],
};

/** Wygląd Popielnika — liczby i barwy rysowane w `scenes/HideoutScene.ts` (figury zastępcze do czasu arkusza z generatora). */
export const HIDEOUT_VISUAL = {
  /** Popiół sypiący się z szybu: barwy i tempo. */
  ash: { colors: [0x8a8478, 0x5c574e, 0xb8b0a0], frequencyMs: 70, maxParticles: 90, lifespanMs: { min: 3500, max: 6500 }, fallSpeed: { min: 8, max: 22 } },
  /** Iskry z paleniska. */
  sparks: { colors: [0xffb347, 0xff7a2a, 0xffe08a], frequencyMs: 160, maxParticles: 24 },
  hearthLightRadius: 150,
  stationLightRadius: 70,
  gateColor: 0xc8201c,
  emberColor: '#ffb347',
  labelColor: '#d8ccb0',
  promptColor: '#ffe08a',
  /** Scena upadku przy pierwszym wejściu (ms). */
  arrival: { textMs: 2600, fallMs: 900, shakeMs: 350 },
} as const;

export const HIDEOUT_TEXT = {
  title: 'POPIELNIK',
  menuLabel: 'POPIELNIK',
  menuInfo: 'Kryjówka pod piecami wieży. Stąd ruszasz w Zejście, na wieżę i na areny.\n\nŻar i odblokowania zostają tu między runami.',
  hint: 'WASD — RUCH · E — UŻYJ · ESC — MENU',
  hintMobile: 'STUKNIJ STANOWISKO, ABY GO UŻYĆ',
  arrival: ['Wiedźma padła. Nad ogrodem wschodzi Czarne Słońce.', 'Taras pęka. Spadasz szybem wieży — obok pieców, niżej niż ktokolwiek.', 'Popiół spalonych zamortyzował upadek.'],
  arrivalEmbers: (embers: number) => `Twoje przedmioty spłonęły w locie: +${embers} Żaru`,
  hearth: (embers: number, rank: string) => `Żar: ${embers} · ${rank}`,
  kilnCold: (embers: number) => `Piec jest jeszcze zimny. Wota pojawią się w kolejnym etapie. Masz ${embers} Żaru.`,
  wall: (runs: number, wins: number, bestDepth: number, floors: number, rank: string) =>
    `Zejścia: ${runs} · Dno zdobyte: ${wins} · Najgłębiej: ${bestDepth}/${floors} · Ranga: ${rank}`,
  wallEmpty: 'Ściana jest pusta. Pierwsze Zejście zapisze tu Twoje imię.',
  shelf: (count: number, total: number) => (count > 0 ? `Trofea: ${count}/${total}` : 'Półka jest pusta. Trofea zostawiają bossowie pokonani od teraz.'),
  coopMobile: 'Zejście we dwoje działa na komputerze (klawiatura + pad).',
} as const;
