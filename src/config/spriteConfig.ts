import { BossAttackKind, BossId } from '@/core/bossTypes';
import type { CombatDecalKind } from '@/config/dressingConfig';
import { EnemyVariant } from '@/core/combatTypes';
import { HeroId } from '@/core/heroTypes';
import type { ItemId } from '@/core/lootTypes';
import { ItemKind } from '@/core/lootTypes';

/** Animacja w arkuszu: kolumny (klatki) w obrębie wiersza kierunku. */
export interface SpriteAnimationDef {
  readonly frames: readonly number[];
  readonly loop: boolean;
  /** Własne tempo animacji; brak = `fps` arkusza. */
  readonly fps?: number;
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
  /**
   * 8 = wiersze to kierunki; 1 = arkusz bez kierunków (np. pocisk); 2–3 = wiersze to warianty
   * (kokony Pożeracza, efekty krwi i soku) — wariant wybiera się jak kierunek w `animationKey`.
   */
  readonly directions: 1 | 2 | 3 | 8;
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
  // Czarodziejka, druga bohaterka (tools/sorceress_sprites.py): chód (0–3) i rzut zaklęcia (4–7),
  // kula wylatuje w kolumnie 7, 17 px przed pivotem. Na razie tylko grafika, bez logiki bohaterki.
  sorceress: {
    key: 'sheet-sorceress',
    url: 'assets/sprites/sorceress_walk-cast.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 384,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      idle: { frames: [0], loop: false },
      cast: { frames: [4, 5, 6, 7], loop: false },
      // Promień (PPM, krok 37): kostur wysunięty, kryształ pulsuje między jasnym a rozbłyskiem.
      channel: { frames: [5, 6], loop: true },
    },
  },
  // Kula energii Czarodziejki (ten sam generator): okrągła, bez obrotu.
  sorceressOrb: {
    key: 'sheet-sorceress-orb',
    url: 'assets/sprites/sorceress_orb.png',
    frameWidth: 16,
    frameHeight: 16,
    sheetWidth: 64,
    sheetHeight: 16,
    directions: 1,
    fps: SPRITE_FPS,
    animations: {
      fly: { frames: [0, 1, 2, 3], loop: true },
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
  // Pajęcze leże (krok 23b, tools/lair_enemies.py): pająk jaskiniowy (Rusher) i nietoperz (Kiter) z falą.
  caveSpider: {
    key: 'sheet-cave-spider',
    url: 'assets/sprites/cave-spider_walk.png',
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
  bat: {
    key: 'sheet-bat',
    url: 'assets/sprites/bat_fly-screech.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 384,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      fly: { frames: [0, 1, 2, 3], loop: true },
      // Skrzek dopasowany do zamachu (windupMs) — fala wylatuje po ostatniej klatce.
      screech: { frames: [4, 5, 6, 7], loop: false },
    },
  },
  // Fala: 8 kierunków lotu (wiersze, bez obrotu o dowolny kąt), 4 klatki migotania.
  batWave: {
    key: 'sheet-bat-wave',
    url: 'assets/sprites/bat_wave.png',
    frameWidth: 32,
    frameHeight: 32,
    sheetWidth: 128,
    sheetHeight: 256,
    directions: 8,
    fps: 10,
    animations: {
      fly: { frames: [0, 1, 2, 3], loop: true },
    },
  },
  // Wrogowie Grzybni (krok 28b, tools/grove_enemies.py): zarażony pająk (chód), grzybiec (pełzanie + plucie)
  // i jego kula zarodników.
  infectedSpider: {
    key: 'sheet-infected-spider',
    url: 'assets/sprites/infected-spider_walk.png',
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
  fungoid: {
    key: 'sheet-fungoid',
    url: 'assets/sprites/fungoid_walk-spit.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 384,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      crawl: { frames: [0, 1, 2, 3], loop: true },
      // Plucie dopasowane do zamachu (windupMs) — kula wylatuje po ostatniej klatce.
      spit: { frames: [4, 5, 6, 7], loop: false },
    },
  },
  // Wrogowie Cmentarzyska (krok 32b, tools/grave_enemies.py): zarażony (chód + zamach pazurami),
  // siewca (chód + plucie; kula to kula zarodników grzybca).
  zombie: {
    key: 'sheet-zombie',
    url: 'assets/sprites/zombie_walk-claw.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 384,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      idle: { frames: [0], loop: false },
      // Zamach dopasowany do windupMs — cios (skrzyżowane dłonie) w ostatniej klatce.
      claw: { frames: [4, 5, 6, 7], loop: false },
    },
  },
  sower: {
    key: 'sheet-sower',
    url: 'assets/sprites/sower_walk-spit.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 384,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      spit: { frames: [4, 5, 6, 7], loop: false },
    },
  },
  // Strażnik Bram (krok 41e, tools/gatekeeper_sprites.py): 96×96, 8 kierunków; 0–3 chód, 4–7 wirowanie
  // łańcuchem, 8–11 uderzenie tarczą (tempo z telegrafu ataku).
  gateWarden: {
    key: 'sheet-gate-warden',
    url: 'assets/sprites/gate-warden_walk-spin-bash.png',
    frameWidth: 96,
    frameHeight: 96,
    sheetWidth: 1152,
    sheetHeight: 768,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      spin: { frames: [4, 5, 6, 7], loop: false },
      bash: { frames: [8, 9, 10, 11], loop: false },
    },
  },
  // Kat Otchłani (krok 41f, tools/gatekeeper_sprites.py): 96×96, 8 kierunków; 0–3 chód, 4–7 wirowanie,
  // 8–11 uderzenie tarczą, 12–15 rzut hakiem, 16–19 oddech palenisk.
  abyssExecutioner: {
    key: 'sheet-abyss-executioner',
    url: 'assets/sprites/abyss-executioner_walk-spin-bash-hook-kindle.png',
    frameWidth: 96,
    frameHeight: 96,
    sheetWidth: 1920,
    sheetHeight: 768,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      spin: { frames: [4, 5, 6, 7], loop: false },
      bash: { frames: [8, 9, 10, 11], loop: false },
      hook: { frames: [12, 13, 14, 15], loop: false },
      kindle: { frames: [16, 17, 18, 19], loop: false },
    },
  },
  // Wrogowie Piekła (krok 41d, tools/infernal_enemies.py): 48×48, 8 kierunków.
  // Ogar: 0–3 bieg, 4 przysiad (zamach), 5–6 lot w skoku, 7 lądowanie / postój po chybieniu.
  hellhound: {
    key: 'sheet-hellhound',
    url: 'assets/sprites/hellhound_run-pounce.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 384,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      run: { frames: [0, 1, 2, 3], loop: true },
      idle: { frames: [0], loop: false },
      crouch: { frames: [4], loop: false },
      leap: { frames: [5, 6], loop: true, fps: 12 },
      land: { frames: [7], loop: false },
    },
  },
  // Upiór zasadzek (krok 49, tools/ghost_sprites.py): 0–3 unoszenie, 4–7 chwyt.
  ghost: {
    key: 'sheet-ghost',
    url: 'assets/sprites/ghost_float-grasp.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 384,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      float: { frames: [0, 1, 2, 3], loop: true },
      grasp: { frames: [4, 5, 6, 7], loop: false },
    },
  },
  // Kultysta: 0–3 chód, 4–7 rzut (bomba wylatuje po kolumnie 7).
  cultist: {
    key: 'sheet-cultist',
    url: 'assets/sprites/cultist_walk-throw.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 384,
    sheetHeight: 384,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      idle: { frames: [0], loop: false },
      throw: { frames: [4, 5, 6, 7], loop: false },
    },
  },
  // Bomba smolna kultysty: bez obrotu, iskra lontu migocze.
  tarBomb: {
    key: 'sheet-tar-bomb',
    url: 'assets/sprites/tar-bomb.png',
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
  sporeBall: {
    key: 'sheet-spore-ball',
    url: 'assets/sprites/spore-ball.png',
    frameWidth: 16,
    frameHeight: 16,
    sheetWidth: 64,
    sheetHeight: 16,
    directions: 1,
    fps: 8,
    animations: {
      fly: { frames: [0, 1, 2, 3], loop: true },
    },
  },
  // Boss „Matka Pająków” (krok 20b, tools/spider_sprites.py): komórka 96×96, 8 kierunków;
  // kolumny 0–3 chód, 4–7 złożenie pajączka (wylęga się 30 px za pivotem w kolumnie 7).
  spiderQueen: {
    key: 'sheet-spider-queen',
    url: 'assets/sprites/spider-queen_move-birth-lash.png',
    frameWidth: 96,
    frameHeight: 96,
    sheetWidth: 1152,
    sheetHeight: 768,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      // Czas złożenia dopasowujemy do wylęgu z planu ataku — pajączek pojawia się na ostatniej klatce.
      birth: { frames: [4, 5, 6, 7], loop: false },
      // Krok 27: smagnięcie przednimi nogami — zamach, uniesienie, cios; ostatnia klatka w chwili uderzenia.
      lash: { frames: [8, 9, 10, 11], loop: false },
    },
  },
  // Śmierć Matki Pająków (krok 24, tools/spider_sprites.py): 96×96, 8 kierunków (zostaje kierunek z chwili
  // śmierci); 0 wzdrygnięcie, 1–3 podkulanie nóg, 4 pęknięte jaja, 5–7 rozpad w posokę. Potem plama `splat`.
  spiderQueenDeath: {
    key: 'sheet-spider-queen-death',
    url: 'assets/sprites/spider-queen_death.png',
    frameWidth: 96,
    frameHeight: 96,
    sheetWidth: 768,
    sheetHeight: 768,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      // 8 klatek w 8 kl./s = 1 s, bez pętli.
      die: { frames: [0, 1, 2, 3, 4, 5, 6, 7], loop: false, fps: 8 },
    },
  },
  // Śmierć Króla Pająków (krok 40, tools/king_sprites.py): 128×128, 8 kierunków; 0 wzdrygnięcie z rozbłyskiem
  // bulw, 1–3 podkulanie łap i opadanie kos, 4 pęknięte bulwy (zarodniki), 5–7 rozpad w kałużę soku. Potem `splat`.
  spiderKingDeath: {
    key: 'sheet-spider-king-death',
    url: 'assets/sprites/spider-king_death.png',
    frameWidth: 128,
    frameHeight: 128,
    sheetWidth: 1024,
    sheetHeight: 1024,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      die: { frames: [0, 1, 2, 3, 4, 5, 6, 7], loop: false, fps: 8 },
    },
  },
  // Śmierć Strażnika (krok 40, tools/sludge_death.py): 96×96, 8 kierunków; 0 ryk agonii, 1–3 ciało osiada,
  // 4–6 tonie w kałuży szlamu, 7 sama kałuża. Potem `slime`.
  sludgeKingDeath: {
    key: 'sheet-sludge-king-death',
    url: 'assets/sprites/sludge-king_death.png',
    frameWidth: 96,
    frameHeight: 96,
    sheetWidth: 768,
    sheetHeight: 768,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      die: { frames: [0, 1, 2, 3, 4, 5, 6, 7], loop: false, fps: 8 },
    },
  },
  // Sieć rzucona przez Matkę Pająków (krok 25, tools/lair_enemies.py): 128×128; 0–5 rozrost (promienie
  // klatek = startRadius → maxRadius z bossConfig.web), 6–7 błysk kropli przy pełnym rozmiarze.
  bossWeb: {
    key: 'sheet-boss-web',
    url: 'assets/sprites/boss-web.png',
    frameWidth: 128,
    frameHeight: 128,
    sheetWidth: 1024,
    sheetHeight: 128,
    directions: 1,
    fps: 3,
    animations: {
      // Tempo rozrostu ustawia gra tak, by trwał spreadMs (6 klatek).
      grow: { frames: [0, 1, 2, 3, 4, 5], loop: false },
      shimmer: { frames: [6, 7], loop: true },
    },
  },
  // Grzybowy Pożeracz (krok 39, tools/devourer_sprites.py, wygląd z paczki właściciela): 96×96, 8 kierunków;
  // 0–3 szuranie, 4–7 pożarcie (kłapnięcie w 6), 8–11 karmienie kokonem (leczenie w 11), 12–15 zamach łapami.
  fungalDevourer: {
    key: 'sheet-fungal-devourer',
    url: 'assets/sprites/fungal-devourer.png',
    frameWidth: 96,
    frameHeight: 96,
    sheetWidth: 1536,
    sheetHeight: 768,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      // Kąsanie: dłuższy telegraf (czaszka pęka), kłapnięcie na ostatniej klatce — w chwili trafienia.
      bite: { frames: [4, 4, 5, 6], loop: false },
      // Zew spiżarni: rozdarta głowa ryczy, sok jaśnieje.
      roar: { frames: [4, 5, 5, 5], loop: false },
      // Uczta: strzępki do kokonu, chwyt, głowa w kokonie, przełknięcie (leczenie) na końcu.
      feed: { frames: [8, 9, 10, 11], loop: false },
      // Zamach łapami (cios Cleave): uderzenie na ostatniej klatce.
      smash: { frames: [12, 13, 14, 15], loop: false },
    },
  },
  // Kokon spiżarni (krok 39, tools/devourer_sprites.py): 48×48, wiersze = 3 warianty (twarz, dłoń, skulone ciało).
  devourerCocoon: {
    key: 'sheet-devourer-cocoon',
    url: 'assets/sprites/devourer-cocoon.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 672,
    sheetHeight: 144,
    directions: 3,
    fps: 3,
    animations: {
      idle: { frames: [0, 1, 2, 3], loop: true },
      // Zjedzony przez Pożeracza; ostatnia klatka (ogryziona łupina) zostaje na podłodze.
      eaten: { frames: [4, 5, 6, 7], loop: false, fps: 8 },
      shake: { frames: [8, 9], loop: true, fps: 14 },
      // Rozdarty od środka — wychodzi zarażony; pusty oplot zostaje.
      tear: { frames: [10, 11, 12, 13], loop: false, fps: 10 },
    },
  },
  // Tron z grzybni (krok 39): dekoracja areny Pożeracza bez kolizji, oparcie na północy.
  fungalThrone: {
    key: 'sheet-fungal-throne',
    url: 'assets/sprites/fungal-throne.png',
    frameWidth: 96,
    frameHeight: 96,
    sheetWidth: 96,
    sheetHeight: 96,
    directions: 1,
    fps: SPRITE_FPS,
    animations: {},
  },
  // Efekty Pożeracza (krok 39): wiersz 0 krew (trafienie gracza), wiersz 1 sok (leczenie bossa).
  fungalFx: {
    key: 'sheet-fungal-fx',
    url: 'assets/sprites/fungal-fx.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 192,
    sheetHeight: 96,
    directions: 2,
    fps: 10,
    animations: {
      burst: { frames: [0, 1, 2, 3], loop: false },
    },
  },
  // Naklejki sali tronowej (krok 39): kałuża krwi, rozbryzg, ślad wleczenia, grzybnia, kałuża soku, krata.
  throneDecals: {
    key: 'sheet-throne-decals',
    url: 'assets/sprites/throne-decals.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 288,
    sheetHeight: 48,
    directions: 1,
    fps: SPRITE_FPS,
    animations: {},
  },
  // Król Pająków (krok 29, tools/king_sprites.py): 128×128, 8 kierunków; 0–3 chód na dwóch grubych łapach,
  // 4–7 atak (zamach, sztylety lewe, prawe, uderzenie kosami — ostatnia klatka w chwili uderzenia).
  spiderKing: {
    key: 'sheet-spider-king',
    url: 'assets/sprites/spider-king_walk-stab.png',
    frameWidth: 128,
    frameHeight: 128,
    sheetWidth: 1024,
    sheetHeight: 1024,
    directions: 8,
    fps: SPRITE_FPS,
    animations: {
      walk: { frames: [0, 1, 2, 3], loop: true },
      stab: { frames: [4, 5, 6, 7], loop: false },
    },
  },
  // Płat trującej grzybni Króla (krok 29, tools/grove_enemies.py): 96×96; 0–5 rozrost (promienie 14→40 px
  // = bossConfig.SPIDER_KING.bloom), 6–7 pulsowanie bulw.
  myceliumPatch: {
    key: 'sheet-mycelium-patch',
    url: 'assets/sprites/mycelium-patch.png',
    frameWidth: 96,
    frameHeight: 96,
    sheetWidth: 768,
    sheetHeight: 96,
    directions: 1,
    fps: 3,
    animations: {
      grow: { frames: [0, 1, 2, 3, 4, 5], loop: false },
      shimmer: { frames: [6, 7], loop: true },
    },
  },
  webBall: {
    key: 'sheet-web-ball',
    url: 'assets/sprites/web-ball.png',
    frameWidth: 16,
    frameHeight: 16,
    sheetWidth: 64,
    sheetHeight: 16,
    directions: 1,
    fps: 12,
    animations: { spin: { frames: [0, 1, 2, 3], loop: true } },
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
  // Kokon leża (krok 23d, tools/lair_enemies.py): 32×32, bez kierunków.
  cocoon: {
    key: 'sheet-cocoon',
    url: 'assets/sprites/cocoon.png',
    frameWidth: 32,
    frameHeight: 32,
    sheetWidth: 256,
    sheetHeight: 32,
    directions: 1,
    fps: SPRITE_FPS,
    animations: {
      idle: { frames: [0, 1], loop: true },
      // Telegraf (300 ms) i rozdarcie szybciej niż spoczynek, żeby zmieściły się w czasie gry.
      fuse: { frames: [2, 3], loop: true, fps: 14 },
      burst: { frames: [4, 5, 6, 7], loop: false, fps: 12 },
    },
  },
  // Purchawka Grzybni (krok 28c, tools/grove_enemies.py): 32×32, bez kierunków.
  puffball: {
    key: 'sheet-puffball',
    url: 'assets/sprites/puffball.png',
    frameWidth: 32,
    frameHeight: 32,
    sheetWidth: 256,
    sheetHeight: 32,
    directions: 1,
    fps: 3,
    animations: {
      idle: { frames: [0, 1], loop: true },
      // Telegraf (500 ms): szybkie drżenie; pęknięcie w ok. 330 ms, ostatnia klatka (skórka) zostaje.
      fuse: { frames: [2, 3], loop: true, fps: 14 },
      burst: { frames: [4, 5, 6, 7], loop: false, fps: 12 },
    },
  },
  // Pułapki ruin (krok 48, tools/ruins_props.py): 32×32 (kafel), bez kierunków.
  ruinsTraps: {
    key: 'sheet-ruins-traps',
    url: 'assets/sprites/ruins-traps.png',
    frameWidth: 32,
    frameHeight: 32,
    sheetWidth: 288,
    sheetHeight: 32,
    directions: 1,
    fps: SPRITE_FPS,
    animations: {
      spikeDown: { frames: [0], loop: false },
      // Ostrzeżenie: płyta drży (szybko).
      spikeWarn: { frames: [1, 2], loop: true, fps: 14 },
      spikeUp: { frames: [3, 4], loop: false, fps: 16 },
      plate: { frames: [5], loop: false },
      platePressed: { frames: [6], loop: false },
      shooter: { frames: [7], loop: false },
      shooterArmed: { frames: [8], loop: false },
    },
  },
  // Urny i skrzynie ruin (krok 48): 0–2 całe, 3–5 szczątki (trwały ślad).
  ruinsBreakables: {
    key: 'sheet-ruins-breakables',
    url: 'assets/sprites/ruins-breakables.png',
    frameWidth: 32,
    frameHeight: 32,
    sheetWidth: 192,
    sheetHeight: 32,
    directions: 1,
    fps: SPRITE_FPS,
    animations: {
      urn0: { frames: [0], loop: false },
      urn1: { frames: [1], loop: false },
      crate: { frames: [2], loop: false },
      urn0Broken: { frames: [3], loop: false },
      urn1Broken: { frames: [4], loop: false },
      crateBroken: { frames: [5], loop: false },
    },
  },
  // Strzałka pułapki (krok 48): grot w prawo, obracana o 90°.
  dart: {
    key: 'sheet-dart',
    url: 'assets/sprites/dart.png',
    frameWidth: 16,
    frameHeight: 16,
    sheetWidth: 16,
    sheetHeight: 16,
    directions: 1,
    fps: SPRITE_FPS,
    animations: { fly: { frames: [0], loop: false } },
  },
  // Palenisko Piekła (krok 41b, tools/brazier_sprites.py): 48×48, bez kierunków; 0–3 tlenie, 4–7 ostrzeżenie
  // (tempo z czasu ostrzeżenia), 8–11 buchnięcie (tempo z czasu buchnięcia).
  brazier: {
    key: 'sheet-brazier',
    url: 'assets/sprites/brazier.png',
    frameWidth: 48,
    frameHeight: 48,
    sheetWidth: 576,
    sheetHeight: 48,
    directions: 1,
    fps: SPRITE_FPS,
    animations: {
      idle: { frames: [0, 1, 2, 3], loop: true },
      warn: { frames: [4, 5, 6, 7], loop: false },
      burst: { frames: [8, 9, 10, 11], loop: true },
    },
  },
  // Trująca chmura purchawki (krok 28c): rozrost (tempo liczy gra z czasu rozrostu) i kłębienie.
  poisonCloud: {
    key: 'sheet-poison-cloud',
    url: 'assets/sprites/poison-cloud.png',
    frameWidth: 96,
    frameHeight: 96,
    sheetWidth: 768,
    sheetHeight: 96,
    directions: 1,
    fps: 3,
    animations: {
      grow: { frames: [0, 1, 2, 3, 4, 5], loop: false },
      swirl: { frames: [6, 7], loop: true },
    },
  },
  // Lepkie pajęczyny leża (krok 23e, tools/lair_enemies.py): 1×1 i 2×2 kafle; błysk wędruje po kroplach kleju.
  stickyWebSmall: {
    key: 'sheet-sticky-web-small',
    url: 'assets/sprites/sticky-web_small.png',
    frameWidth: 32,
    frameHeight: 32,
    sheetWidth: 128,
    sheetHeight: 32,
    directions: 1,
    fps: 3,
    animations: { shimmer: { frames: [0, 1, 2, 3], loop: true } },
  },
  stickyWebLarge: {
    key: 'sheet-sticky-web-large',
    url: 'assets/sprites/sticky-web_large.png',
    frameWidth: 64,
    frameHeight: 64,
    sheetWidth: 256,
    sheetHeight: 64,
    directions: 1,
    fps: 3,
    animations: { shimmer: { frames: [0, 1, 2, 3], loop: true } },
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
  /** Ogar (krok 41d): lot w skoku i lądowanie (także postój po chybionym skoku). */
  readonly leap?: string;
  readonly land?: string;
  /**
   * Cień pod postacią chodzącą, rysowany przez silnik (STYLEGUIDE §6). Brak = postać ma własny
   * cień w sprite'cie (lewitujący mag) albo podstawę z kałuży (boss). Wymiary i przesunięcie w px.
   */
  readonly groundShadow?: { readonly width: number; readonly height: number; readonly offsetX: number; readonly offsetY: number };
  /** Rysowany nad warstwą mroku — świeci w ciemności (upiór, krok 49). */
  readonly aboveDarkness?: boolean;
}

/** Cień pod postaciami 32 px (bohater, Rusher): lekko w dół, jak światło z północy. */
const WALKER_SHADOW = { width: 22, height: 12, offsetX: 1, offsetY: 4 } as const;

/** Wygląd każdego wariantu wroga (krok 23b: warianty biomów). */
export const ENEMY_VISUALS: Readonly<Record<EnemyVariant, EnemyVisual>> = {
  [EnemyVariant.TrashcanMan]: { sheet: 'trashcanMan', move: 'walk', idle: 'idle', groundShadow: WALKER_SHADOW },
  [EnemyVariant.DemonMage]: { sheet: 'demonMage', move: 'float', attack: 'cast' },
  [EnemyVariant.CaveSpider]: { sheet: 'caveSpider', move: 'walk', idle: 'idle', groundShadow: WALKER_SHADOW },
  // Nietoperz lata: cień od silnika mniejszy i dalej pod nim.
  [EnemyVariant.Bat]: { sheet: 'bat', move: 'fly', attack: 'screech', groundShadow: { width: 14, height: 6, offsetX: 0, offsetY: 12 } },
  [EnemyVariant.InfectedSpider]: { sheet: 'infectedSpider', move: 'walk', idle: 'idle', groundShadow: WALKER_SHADOW },
  // Grzybiec pełznie przy ziemi: szeroki, płaski cień pod kapeluszem.
  [EnemyVariant.Fungoid]: { sheet: 'fungoid', move: 'crawl', attack: 'spit', groundShadow: { width: 20, height: 8, offsetX: 0, offsetY: 3 } },
  [EnemyVariant.Zombie]: { sheet: 'zombie', move: 'walk', idle: 'idle', attack: 'claw', groundShadow: WALKER_SHADOW },
  [EnemyVariant.Sower]: { sheet: 'sower', move: 'walk', attack: 'spit', groundShadow: WALKER_SHADOW },
  [EnemyVariant.Hellhound]: {
    sheet: 'hellhound',
    move: 'run',
    idle: 'idle',
    attack: 'crouch',
    leap: 'leap',
    land: 'land',
    groundShadow: WALKER_SHADOW,
  },
  [EnemyVariant.Cultist]: { sheet: 'cultist', move: 'walk', idle: 'idle', attack: 'throw', groundShadow: WALKER_SHADOW },
  // Upiór unosi się nad posadzką — bez cienia (krok 49).
  [EnemyVariant.Ghost]: { sheet: 'ghost', move: 'float', attack: 'grasp', aboveDarkness: true },
};

/** Upiór (krok 49): świeci nad mrokiem; przezroczystość cielesny/bezcielesny; wynurzanie się przy pojawieniu. */
export const GHOST_VISUAL = {
  solidAlpha: 0.9,
  phasedAlpha: 0.28,
  /** Wynurzanie: od tej alfy do pełnej przez czas `riseMs` z konfiguracji zasadzki. */
  riseFromAlpha: 0,
} as const;

/**
 * Rzuty łukiem (krok 41d): wygląd bomby, start przed rzucającym i wysokość łuku (wizualnie — bomba unosi się
 * nad swoim cieniem). Ogień na podłodze rysuje silnik: koła w kolorach żaru (ADD, stała alfa — §6b).
 */
export const LOB_VISUALS: Readonly<Partial<Record<EnemyVariant, { readonly sheet: SpriteSheetId; readonly animation: string; readonly forwardOffset: number; readonly arcHeight: number }>>> = {
  [EnemyVariant.Cultist]: { sheet: 'tarBomb', animation: 'fly', forwardOffset: 12, arcHeight: 28 },
};

export const FIRE_PATCH_VISUAL = { outer: 0xa82010, inner: 0xe0701c, alpha: 0.3, innerScale: 0.55 } as const;

/**
 * Pocisk wariantu strzelającego: arkusz, animacja, przesunięcie startu przed strzelca (px)
 * i czy arkusz ma wiersze kierunków lotu (fala nietoperza).
 */
export interface EnemyProjectileVisual {
  readonly sheet: SpriteSheetId;
  readonly animation: string;
  readonly forwardOffset: number;
  readonly directional: boolean;
}

export const PLAYER_VISUAL = {
  sheet: 'barbarian',
  move: 'walk',
  idle: 'idle',
  attack: 'attack',
  groundShadow: WALKER_SHADOW,
} as const satisfies EnemyVisual;

/** Wygląd bohatera; Czarodziejka ma dodatkowo animację promienia. */
export interface HeroVisual extends EnemyVisual {
  readonly attack: string;
  readonly idle: string;
  readonly channel?: string;
  readonly groundShadow: NonNullable<EnemyVisual['groundShadow']>;
}

/** Wygląd grywalnych bohaterów (krok 37). */
export const HERO_VISUALS: Readonly<Record<HeroId, HeroVisual>> = {
  [HeroId.Barbarian]: PLAYER_VISUAL,
  [HeroId.Sorceress]: {
    sheet: 'sorceress',
    move: 'walk',
    idle: 'idle',
    attack: 'cast',
    channel: 'channel',
    groundShadow: WALKER_SHADOW,
  },
};

/** Kula energii Czarodziejki: okrągła, bez kierunków (także na orbicie). */
export const SORCERESS_ORB_VISUAL = { sheet: 'sorceressOrb', animation: 'fly' } as const satisfies {
  sheet: SpriteSheetId;
  animation: string;
};

/** Pociski wariantów strzelających: kula maga (wg handoffu), fala nietoperza. */
export const ENEMY_PROJECTILE_VISUALS: Readonly<Partial<Record<EnemyVariant, EnemyProjectileVisual>>> = {
  [EnemyVariant.DemonMage]: { sheet: 'demonOrb', animation: 'fly', forwardOffset: 13, directional: false },
  [EnemyVariant.Bat]: { sheet: 'batWave', animation: 'fly', forwardOffset: 12, directional: true },
  [EnemyVariant.Fungoid]: { sheet: 'sporeBall', animation: 'fly', forwardOffset: 12, directional: false },
  [EnemyVariant.Sower]: { sheet: 'sporeBall', animation: 'fly', forwardOffset: 12, directional: false },
};

export interface BossVisual extends EnemyVisual {
  /** Animacja przed atakiem danego rodzaju; ataki bez wpisu (np. uderzenie Strażnika) mają tylko telegraf. */
  readonly attacks: Readonly<Partial<Record<BossAttackKind, string>>>;
  /** Trwały ślad w miejscu śmierci bossa. */
  readonly deathDecal: CombatDecalKind;
  /** Animacja śmierci (arkusz kierunkowy); brak = tylko błysk i ślad. Nagroda czeka na jej koniec. */
  readonly death?: { readonly sheet: SpriteSheetId; readonly animation: string };
}

/**
 * Wygląd bossów. Strażnik (Sludge King) pluje przed atakami z pociskami / strefami na odległość;
 * uderzenie wokół siebie nie ma plucia — jego telegraf jest czytelny sam w sobie.
 * Matka Pająków: zew (złożenie) kończy się z pierwszym cieniem wylęgu, smagnięcie — w chwili uderzenia.
 */
export const BOSS_VISUALS: Readonly<Record<BossId, BossVisual>> = {
  [BossId.FloorGuardian]: {
    sheet: 'sludgeKing',
    move: 'move',
    attacks: { [BossAttackKind.Nova]: 'spit', [BossAttackKind.Barrage]: 'spit' },
    deathDecal: 'slime',
    death: { sheet: 'sludgeKingDeath', animation: 'die' },
  },
  [BossId.SpiderQueen]: {
    sheet: 'spiderQueen',
    move: 'walk',
    attacks: { [BossAttackKind.Brood]: 'birth', [BossAttackKind.Lash]: 'lash' },
    deathDecal: 'splat',
    death: { sheet: 'spiderQueenDeath', animation: 'die' },
  },
  // Król Pająków (krok 29): atak „stab” (zamach → sztylety → kosy) przed ścięciem, gradem sztyletów i rzutem kokonem.
  [BossId.SpiderKing]: {
    sheet: 'spiderKing',
    move: 'walk',
    attacks: {
      [BossAttackKind.Lash]: 'stab',
      [BossAttackKind.Flurry]: 'stab',
      [BossAttackKind.CocoonThrow]: 'stab',
      [BossAttackKind.Slam]: 'stab',
    },
    deathDecal: 'splat',
    death: { sheet: 'spiderKingDeath', animation: 'die' },
  },
  // Grzybowy Pożeracz (krok 39): zamach łapami, kąsanie, uczta (karmienie) i ryk zewu; skok bez animacji (przysiad).
  [BossId.FungalDevourer]: {
    sheet: 'fungalDevourer',
    move: 'walk',
    attacks: {
      [BossAttackKind.Cleave]: 'smash',
      [BossAttackKind.Lash]: 'bite',
      [BossAttackKind.Feast]: 'feed',
      [BossAttackKind.Call]: 'roar',
    },
    deathDecal: 'splat',
  },
  // Kat Otchłani (krok 41f): jak Strażnik Bram, do tego rzut hakiem i oddech palenisk.
  [BossId.AbyssExecutioner]: {
    sheet: 'abyssExecutioner',
    move: 'walk',
    attacks: {
      [BossAttackKind.Slam]: 'spin',
      [BossAttackKind.Cleave]: 'bash',
      [BossAttackKind.Hook]: 'hook',
      [BossAttackKind.Kindle]: 'kindle',
    },
    deathDecal: 'splat',
  },
  // Strażnik Bram (krok 41e): wirowanie łańcuchem (slam) i uderzenie tarczą (cleave).
  [BossId.GateWarden]: {
    sheet: 'gateWarden',
    move: 'walk',
    attacks: { [BossAttackKind.Slam]: 'spin', [BossAttackKind.Cleave]: 'bash' },
    deathDecal: 'splat',
  },
};

/** Pierścień ognia Kata (wściekłość): pas ognia poza wolnym kołem (ADD, stała alfa), jasna krawędź koła. */
export const FIRE_RING_VISUAL = { fill: 0xa82010, fillAlpha: 0.4, edge: 0xe0701c, edgeAlpha: 0.8, edgeWidth: 3 } as const;

/** Tarcza bossa: łuk chronionego stożka rysowany przed bossem (cienki, w kolorze żaru, stała alfa). */
export const SHIELD_ARC_VISUAL = { color: 0xe0701c, alpha: 0.45, width: 2, gap: 6 } as const;

/** Rozprysk kuli Czarodziejki (krok 50): pierścień w kolorze kul. */
export const ORB_SPLASH_VISUAL = { color: 0x6ee7ff, alpha: 0.7, fillAlpha: 0.18, durationMs: 220 } as const;

/** Pułapki i rzeczy do rozbicia ruin (krok 48). */
export const TRAP_VISUAL = {
  sheet: 'ruinsTraps',
  breakables: 'ruinsBreakables',
  dart: 'dart',
  /** Czerwona ramka płyty w ostrzeżeniu (jak telegrafy ataków). */
  warnColor: 0xff3b30,
  warnAlpha: 0.55,
  /** Linia strzału uzbrojonej pułapki. */
  lineAlpha: 0.35,
} as const;

/** Ukryta komnata (krok 46): odsłonięcie i kokony skarbu (wygląd kokonu leża). */
export const SECRET_ROOM_VISUAL = {
  /** Zapas (kafle) wokół komnaty przy podmianie obrazu — cienie i mury sąsiadów też się zmieniają. */
  redrawMargin: 3,
  cocoonRadius: 9,
  revealFlashRadius: 40,
  prizeFlashRadius: 26,
  shakeMs: 180,
  shakeIntensity: 0.004,
  emptyText: '#9c8f74',
  toastMs: 3000,
} as const;

/** Oznaczenie elity (krok 42): pierścień pod stopami (pulsuje), nazwa cech nad głową. */
export const ELITE_VISUAL = {
  ringGap: 5,
  ringThickness: 2,
  ringAlpha: 0.85,
  pulseMs: 700,
  labelOffset: 10,
  fontSize: 9,
  /** Plama wybuchu Wybuchowego i kolor jego strefy. */
  volatileZone: 0xffb02e,
  lifestealText: '#7dff9a',
  /** Komunikat o elicie, gdy pierwszy raz widzi gracza bliżej niż tyle (px; ok. pół widoku). */
  spotRange: 220,
  toastMs: 3500,
} as const;

/**
 * Kokon spiżarni Pożeracza: oddech, drżenie przy zewie, zjedzenie albo rozdarcie (łupina zostaje na podłodze).
 * `variants` — liczba wierszy arkusza (twarz, dłoń, skulone ciało).
 */
export const LARDER_VISUAL = {
  sheet: 'devourerCocoon',
  variants: 3,
  idle: 'idle',
  shake: 'shake',
  eaten: 'eaten',
  tear: 'tear',
  groundShadow: { width: 18, height: 6, offsetX: 0, offsetY: 14 },
} as const;

/**
 * Sala tronowa Pożeracza (krok 39): tron i naklejki podłogi (kolumny `throneDecals` w kolejności
 * `ThroneDecalKind`), krew na graczu po trafieniu i sok nad bossem przy leczeniu (wiersze `fungalFx`).
 */
export const THRONE_ROOM_VISUAL = {
  throne: 'fungalThrone',
  decals: 'throneDecals',
  fx: { sheet: 'fungalFx', animation: 'burst', bloodRow: 0, sapRow: 1 },
} as const;

/** Pajączek: bieg, zapłon (telegraf) i osobny arkusz wybuchu; cień od silnika (chodzi po ziemi). */
export const SPIDERLING_VISUAL = {
  sheet: 'spiderling',
  move: 'run',
  prime: 'prime',
  burst: { sheet: 'spiderlingBurst', animation: 'burst' },
  groundShadow: { width: 14, height: 8, offsetX: 1, offsetY: 3 },
} as const satisfies EnemyVisual & { readonly prime: string; readonly burst: { readonly sheet: SpriteSheetId; readonly animation: string } };

/** Kokon: spoczynek, telegraf, rozdarcie; ostatnia klatka rozdarcia (strzępy) zostaje na podłodze. */
export const COCOON_VISUAL = {
  sheet: 'cocoon',
  idle: 'idle',
  fuse: 'fuse',
  burst: 'burst',
  groundShadow: { width: 16, height: 6, offsetX: 1, offsetY: 9 },
} as const;

/** Purchawka i jej chmura (krok 28c). Chmura półprzezroczysta — gaz, pod którym widać walkę. */
/**
 * Palenisko (krok 41b): animacje faz i wygląd buchnięcia w strefie (dwa koła ognia w kolorach rampy płomienia,
 * mieszanie ADD ze stałą alfą — dozwolona półprzezroczystość efektów, STYLEGUIDE §6b). Światło paleniska jak
 * pochodnia: mniejsze, gdy się tli, pełne przy buchnięciu.
 */
export const BRAZIER_VISUAL = {
  sheet: 'brazier',
  idle: 'idle',
  warn: 'warn',
  burst: 'burst',
  fire: { outer: 0xa82010, inner: 0xe0701c, alpha: 0.3, innerScale: 0.6 },
  // Stałe promienie (każdy promień to osobna tekstura światła — bez płynnego rozrostu).
  light: { idleRadius: 40, warnRadius: 64, burstRadius: 96 },
} as const satisfies {
  readonly sheet: SpriteSheetId;
  readonly idle: string;
  readonly warn: string;
  readonly burst: string;
  readonly fire: { readonly outer: number; readonly inner: number; readonly alpha: number; readonly innerScale: number };
  readonly light: { readonly idleRadius: number; readonly warnRadius: number; readonly burstRadius: number };
};

export const PUFFBALL_VISUAL = {
  sheet: 'puffball',
  idle: 'idle',
  fuse: 'fuse',
  burst: 'burst',
  groundShadow: { width: 16, height: 5, offsetX: 0, offsetY: 7 },
  cloud: { sheet: 'poisonCloud', grow: 'grow', swirl: 'swirl', alpha: 0.6, fadeMs: 600 },
} as const satisfies {
  readonly sheet: SpriteSheetId;
  readonly idle: string;
  readonly fuse: string;
  readonly burst: string;
  readonly groundShadow: NonNullable<EnemyVisual['groundShadow']>;
  readonly cloud: { readonly sheet: SpriteSheetId; readonly grow: string; readonly swirl: string; readonly alpha: number; readonly fadeMs: number };
};

/** Lepka pajęczyna: arkusz wg rozmiaru w kaflach. */
export const STICKY_WEB_VISUAL = {
  sheets: { 1: 'stickyWebSmall', 2: 'stickyWebLarge' },
  animation: 'shimmer',
} as const satisfies { readonly sheets: Readonly<Record<1 | 2, SpriteSheetId>>; readonly animation: string };

/** Rzut siecią Matki Pająków: kłąb w locie i rosnąca plama. */
export const BOSS_WEB_VISUAL = {
  ball: { sheet: 'webBall', animation: 'spin' },
  patch: { sheet: 'bossWeb', grow: 'grow', shimmer: 'shimmer' },
  /** Wysokość łuku lotu kłębu (px, czysto wizualnie). */
  arcHeight: 36,
} as const;

/** Płaty z ataków bossów: sieć Matki Pająków i grzybnia Króla (ten sam mechanizm, inny arkusz). */
export const BOSS_PATCH_VISUALS = {
  web: BOSS_WEB_VISUAL.patch,
  mycelium: { sheet: 'myceliumPatch', grow: 'grow', shimmer: 'shimmer' },
} as const satisfies Record<'web' | 'mycelium', { readonly sheet: SpriteSheetId; readonly grow: string; readonly shimmer: string }>;

/** Kokon rzucany przez Króla Pająków (krok 29): spoczynkowe klatki kokonu leża, lot łukiem. */
export const KING_COCOON_VISUAL = {
  sheet: 'cocoon',
  animation: 'idle',
  /** Wysokość łuku lotu (px, czysto wizualnie). */
  arcHeight: 48,
} as const;

/** Królewski skok Matki Pająków (krok 26) — czysto wizualnie. */
export const BOSS_LEAP_VISUAL = {
  /** Wysokość łuku lotu (px). */
  arcHeight: 44,
  /** Skala sprite'a w szczycie lotu (bliżej kamery). */
  apexScale: 1.18,
  /** Przysiad przed skokiem: spłaszczenie (scaleX, scaleY). */
  crouch: { x: 1.08, y: 0.88 },
  /** Cień pod lecącą królową (elipsa, px). */
  shadow: { width: 52, height: 22 },
  /** Wstrząs kamery przy lądowaniu. */
  landShake: { durationMs: 220, intensity: 0.008 },
} as const;

/** Wylęg z sufitu (krok 26): pajączek widoczny na nici w końcówce cienia; promień pełnego cienia. */
export const SPIDERLING_DROP_VISUAL = {
  fallMs: 220,
  shadowRadius: 10,
} as const;

/** Wejście bossa na arenę i wściekłość — wstrząs kamery (królewski zew Matki Pająków). */
export const BOSS_PRESENCE_VISUAL = {
  introShake: { durationMs: 450, intensity: 0.006 },
  enrageShake: { durationMs: 600, intensity: 0.01 },
} as const;

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
