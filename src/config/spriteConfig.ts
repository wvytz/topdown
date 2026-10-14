import { BossAttackKind, BossId } from '@/core/bossTypes';
import type { CombatDecalKind } from '@/config/dressingConfig';
import { EnemyType } from '@/core/combatTypes';
import type { ItemId } from '@/core/lootTypes';
import { ItemKind } from '@/core/lootTypes';

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
  // Generator tools/barbarian_sword.py (krok 21): chód z mieczem (0–3) i cios od prawej do lewej (4–7).
  barbarian: {
    key: 'sheet-blond-barbarian',
    url: 'assets/sprites/blond-barbarian_walk-attack.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 384,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      idle: { frames: [0], loop: false },
      // Czas ciosu = attackCooldownMs (4 × 80 ms przy 320 ms) — wyjątek od 6 kl./s, logika walki nadrzędna.
      attack: { frames: [4, 5, 6, 7], loop: false },
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
  // Boss „Matka Pająków” (krok 20b, tools/spider_sprites.py): komórka 96×96, 8 kierunków;
  // kolumny 0–3 chód, 4–7 złożenie pajączka (wylęga się 30 px za pivotem w kolumnie 7).
  spiderQueen: {
    key: 'sheet-spider-queen',
    url: 'assets/sprites/spider-queen_move-birth.png',
    frameWidth: 96,
    frameHeight: 96,
    sheetWidth: 768,
    sheetHeight: 768,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      // Czas złożenia dopasowujemy do wylęgu z planu ataku — pajączek pojawia się na ostatniej klatce.
      birth: { frames: [4, 5, 6, 7], loop: false },
    },
  },
  // Pajączek-kamikaze: 48×48, 8 kierunków; 0–3 bieg, 4–7 zapłon (telegraf wybuchu, bez pętli).
  spiderling: {
    key: 'sheet-spiderling',
    url: 'assets/sprites/spiderling_walk-prime.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 384,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      run: { frames: [0, 1, 2, 3], loop: true },
      prime: { frames: [4, 5, 6, 7], loop: false },
    },
  },
  spiderlingBurst: {
    key: 'sheet-spiderling-burst',
    url: 'assets/sprites/spiderling_burst.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 192,
    sheetHeight: 48,
    directions: 1,
    // Wybuch szybszy niż chód: 4 klatki w ok. 330 ms.
    fps: 12,
    animations: {
      burst: { frames: [0, 1, 2, 3], loop: false },
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
  attack: 'attack',
  groundShadow: WALKER_SHADOW,
} as const satisfies EnemyVisual;

/** Pocisk maga: arkusz, animacja i przesunięcie startu przed maga (px, wg handoffu). */
export const KITER_PROJECTILE_VISUAL = { sheet: 'demonOrb', animation: 'fly', forwardOffset: 13 } as const;

export interface BossVisual extends EnemyVisual {
  readonly attack: string;
  /** Ataki z animacją `attack`; pozostałe (np. uderzenie Strażnika) mają tylko telegraf. */
  readonly attackKinds: readonly BossAttackKind[];
  /** Trwały ślad w miejscu śmierci bossa. */
  readonly deathDecal: CombatDecalKind;
}

/**
 * Wygląd bossów. Strażnik (Sludge King) pluje przed atakami z pociskami / strefami na odległość;
 * uderzenie wokół siebie nie ma plucia — jego telegraf jest czytelny sam w sobie.
 * Matka Pająków składa pajączki — animacja złożenia kończy się w chwili wylęgu.
 */
export const BOSS_VISUALS: Readonly<Record<BossId, BossVisual>> = {
  [BossId.FloorGuardian]: {
    sheet: 'sludgeKing',
    move: 'move',
    attack: 'spit',
    attackKinds: [BossAttackKind.Nova, BossAttackKind.Barrage],
    deathDecal: 'slime',
  },
  [BossId.SpiderQueen]: {
    sheet: 'spiderQueen',
    move: 'walk',
    attack: 'birth',
    attackKinds: [BossAttackKind.Brood],
    deathDecal: 'splat',
  },
};

/** Pajączek: bieg, zapłon (telegraf) i osobny arkusz wybuchu; cień od silnika (chodzi po ziemi). */
export const SPIDERLING_VISUAL = {
  sheet: 'spiderling',
  move: 'run',
  prime: 'prime',
  burst: { sheet: 'spiderlingBurst', animation: 'burst' },
  groundShadow: { width: 14, height: 8, offsetX: 1, offsetY: 3 },
} as const satisfies EnemyVisual & { readonly prime: string; readonly burst: { readonly sheet: SpriteSheetId; readonly animation: string } };

/** Pocisk bossa (fale Novy). */
export const BOSS_PROJECTILE_VISUAL = { sheet: 'sludgeGlob', animation: 'fly' } as const;

/** Klucz animacji Phasera dla arkusza, animacji i kierunku. */
export function animationKey(sheet: SpriteSheetId, animation: string, direction = 0): string {
  return `${SPRITE_SHEETS[sheet].key}-${animation}-${direction}`;
}

// ---------------- łupy, kapliczka, pocisk gracza, znacznik celowania (krok 20) ----------------

/**
 * Atlas z generatora tools/loot_sprites.py (paleta C): klatki nazwane, różne rozmiary
 * (16×16 łupy i pociski, 32×32 kapliczka). Animacje 4-klatkowe w 6 kl./s jak postacie.
 */
export const LOOT_ATLAS = {
  key: 'atlas-loot',
  textureUrl: 'assets/sprites/loot.png',
  atlasUrl: 'assets/sprites/loot.json',
  fps: SPRITE_FPS,
} as const;

const numbered = (prefix: string, count: number): readonly string[] => Array.from({ length: count }, (_, i) => `${prefix}_${i}`);

export const LOOT_FRAMES = {
  coin: numbered('coin', 4),
  potion: numbered('potion', 1),
  shot: numbered('shot', 4),
  shotPierce: numbered('shot_pierce', 4),
  /** Znacznik celowania: 8 kierunków w kolejności wierszy postaci (N, NE, … NW). */
  aim: numbered('aim', 8),
  shrineActive: numbered('shrine_active', 4),
  shrineUsed: numbered('shrine_used', 1),
} as const;

/** Animacje atlasu łupów: nazwa → klatki (zapętlone). */
export const LOOT_ANIMATIONS = {
  coin: LOOT_FRAMES.coin,
  shot: LOOT_FRAMES.shot,
  shotPierce: LOOT_FRAMES.shotPierce,
  shrineActive: LOOT_FRAMES.shrineActive,
} as const;

export type LootAnimation = keyof typeof LOOT_ANIMATIONS;

export function lootAnimationKey(name: LootAnimation | `item-${string}`): string {
  return `${LOOT_ATLAS.key}-${name}`;
}

/** Klatki ikony przedmiotu: bazowy — 1 (statyczny), z efektem — 4 (iskra). */
export function itemFrames(id: ItemId, kind: ItemKind): readonly string[] {
  return numbered(`item_${id}`, kind === ItemKind.Effect ? 4 : 1);
}
