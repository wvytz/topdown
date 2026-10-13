import { BossAttackKind } from '@/core/bossTypes';
import { EnemyType } from '@/core/combatTypes';

/** Animacja w arkuszu: kolumny (klatki) w obrębie wiersza kierunku. */
export interface SpriteAnimationDef {
  readonly frames: readonly number[];
  readonly loop: boolean;
}

/**
 * Arkusz sprite'ów z paczki „Long-handed arcade slasher” (handoff/sprites.json).
 * Komórka 48×48, pivot w środku. Arkusze kierunkowe: 8 wierszy (N, NE, E, SE, S, SW, W, NW).
 */
export interface SpriteSheetDef {
  readonly key: string;
  /** Ścieżka względem strony (pliki w public/assets/sprites). */
  readonly url: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  /** 8 = wiersze to kierunki; 1 = arkusz bez kierunków (np. pocisk). */
  readonly directions: 1 | 8;
  readonly fps: number;
  readonly animations: Readonly<Record<string, SpriteAnimationDef>>;
}

export const SPRITE_FPS = 6;

export const SPRITE_SHEETS = {
  barbarian: {
    key: 'sheet-blond-barbarian',
    url: 'assets/sprites/blond-barbarian_walk.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 192,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      idle: { frames: [0], loop: false },
    },
  },
  trashcanMan: {
    key: 'sheet-trashcan-man',
    url: 'assets/sprites/trashcan-man_walk.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 192,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      idle: { frames: [0], loop: false },
    },
  },
  demonMage: {
    key: 'sheet-demon-mage',
    url: 'assets/sprites/demon-mage_float-cast.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 384,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      float: { frames: [0, 1, 2, 3], loop: true },
      // Czas rzutu dopasowujemy do zamachu ataku (windupMs) — logika walki pozostaje nadrzędna.
      cast: { frames: [4, 5, 6, 7], loop: false },
    },
  },
  demonOrb: {
    key: 'sheet-demon-mage-orb',
    url: 'assets/sprites/demon-mage_orb.png',
    frameWidth: 16,
    frameHeight: 16,
    sheetWidth: 64,
    sheetHeight: 16,
    directions: 1,
    fps: 10,
    animations: {
      fly: { frames: [0, 1, 2, 3], loop: true },
    },
  },
  // Boss „Sludge King” (bez sprites.json — układ odczytany z obrazu): komórka 96×96, wiersze = 8 kierunków
  // jak wyżej; kolumny 0–3 ruch (kołysanie), 4–7 plucie (w kolumnie 7 wylatuje kula).
  sludgeKing: {
    key: 'sheet-sludge-king',
    url: 'assets/sprites/sludge-king_move-spit.png',
    frameWidth: 96,
    frameHeight: 96,
    sheetWidth: 768,
    sheetHeight: 768,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      move: { frames: [0, 1, 2, 3], loop: true },
      // Czas plucia dopasowujemy do telegrafu ataku — kula wylatuje w chwili wystrzału.
      spit: { frames: [4, 5, 6, 7], loop: false },
    },
  },
  sludgeGlob: {
    key: 'sheet-sludge-king-glob',
    url: 'assets/sprites/sludge-king_glob.png',
    frameWidth: 16,
    frameHeight: 16,
    sheetWidth: 64,
    sheetHeight: 16,
    directions: 1,
    fps: 10,
    animations: {
      fly: { frames: [0, 1, 2, 3], loop: true },
    },
  },
} as const satisfies Readonly<Record<string, SpriteSheetDef>>;

export type SpriteSheetId = keyof typeof SPRITE_SHEETS;

/** Jak wygląda każdy archetyp wroga: arkusz oraz animacja ruchu i (opcjonalnie) ataku. */
export interface EnemyVisual {
  readonly sheet: SpriteSheetId;
  /** Animacja w ruchu (dla maga: unoszenie, także w miejscu). */
  readonly move: string;
  /** Animacja w miejscu; brak = `move` gra zawsze. */
  readonly idle?: string;
  /** Animacja zamachu ataku (dopasowana czasem do windupMs). */
  readonly attack?: string;
  /**
   * Cień pod postacią chodzącą, rysowany przez silnik (STYLEGUIDE §6). Brak = postać ma własny
   * cień w sprite'cie (lewitujący mag) albo podstawę z kałuży (boss). Wymiary i przesunięcie w px.
   */
  readonly groundShadow?: { readonly width: number; readonly height: number; readonly offsetX: number; readonly offsetY: number };
}

/** Cień pod postaciami 32 px (bohater, Rusher): lekko w dół, jak światło z północy. */
const WALKER_SHADOW = { width: 22, height: 12, offsetX: 1, offsetY: 4 } as const;

export const ENEMY_VISUALS: Readonly<Record<EnemyType, EnemyVisual>> = {
  [EnemyType.Rusher]: { sheet: 'trashcanMan', move: 'walk', idle: 'idle', groundShadow: WALKER_SHADOW },
  [EnemyType.Kiter]: { sheet: 'demonMage', move: 'float', attack: 'cast' },
};

export const PLAYER_VISUAL = {
  sheet: 'barbarian',
  move: 'walk',
  idle: 'idle',
  groundShadow: WALKER_SHADOW,
} as const satisfies EnemyVisual;

/** Pocisk maga: arkusz, animacja i przesunięcie startu przed maga (px, wg handoffu). */
export const KITER_PROJECTILE_VISUAL = { sheet: 'demonOrb', animation: 'fly', forwardOffset: 13 } as const;

/**
 * Boss: ruch w pętli; plucie przed atakami z pociskami / strefami na odległość.
 * Uderzenie (strefa wokół bossa) nie ma plucia — jego telegraf jest czytelny sam w sobie.
 */
export const BOSS_VISUAL = {
  sheet: 'sludgeKing',
  move: 'move',
  attack: 'spit',
  attackKinds: [BossAttackKind.Nova, BossAttackKind.Barrage],
} as const satisfies EnemyVisual & { readonly attackKinds: readonly BossAttackKind[] };

/** Pocisk bossa (fale Novy). */
export const BOSS_PROJECTILE_VISUAL = { sheet: 'sludgeGlob', animation: 'fly' } as const;

/** Klucz animacji Phasera dla arkusza, animacji i kierunku. */
export function animationKey(sheet: SpriteSheetId, animation: string, direction = 0): string {
  return `${SPRITE_SHEETS[sheet].key}-${animation}-${direction}`;
}
