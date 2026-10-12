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
}

export const ENEMY_VISUALS: Readonly<Record<EnemyType, EnemyVisual>> = {
  [EnemyType.Rusher]: { sheet: 'trashcanMan', move: 'walk', idle: 'idle' },
  [EnemyType.Kiter]: { sheet: 'demonMage', move: 'float', attack: 'cast' },
};

export const PLAYER_VISUAL = { sheet: 'barbarian', move: 'walk', idle: 'idle' } as const satisfies EnemyVisual;

/** Pocisk maga: arkusz, animacja i przesunięcie startu przed maga (px, wg handoffu). */
export const KITER_PROJECTILE_VISUAL = { sheet: 'demonOrb', animation: 'fly', forwardOffset: 13 } as const;

/** Klucz animacji Phasera dla arkusza, animacji i kierunku. */
export function animationKey(sheet: SpriteSheetId, animation: string, direction = 0): string {
  return `${SPRITE_SHEETS[sheet].key}-${animation}-${direction}`;
}
