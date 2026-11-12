import type { SpiderVaultConfig } from '@/dungeon/SpiderVault';

/**
 * Skarbiec pająków (krok U4d, prośba właściciela 12.11.2026): ukryta komnata za areną Króla Pająków gęsto
 * opleciona jedwabiem i śluzem, kokony skarbu na piedestałach. Planowanie: `dungeon/SpiderVault.ts`,
 * grafika: `tools/spider_vault_sprites.py`, rysowanie: `effects/SpiderVaultView.ts`.
 */
export const SPIDER_VAULT_CONFIG: SpiderVaultConfig = {
  wallMargin: 1,
  pedestalPairs: { min: 2, max: 3 },
  silkChance: { edge: 0.95, ring: 0.75, inner: 0.5, nearPedestal: 0.9, corridor: 0.7 },
  silkVariants: 6,
  silkJitter: 0.3,
  slimePools: { min: 4, max: 7 },
  slimeVariants: 4,
  slimeJitter: 0.25,
  curtainChance: 0.8,
  curtainVariants: 3,
  husks: { min: 1, max: 2 },
  huskVariants: 2,
  threadsPerPedestal: { min: 2, max: 3 },
  threadReach: { min: 1.5, max: 4.5 },
  cornerChords: { min: 2, max: 4 },
  chordReach: { min: 0.6, max: 2.6 },
  sag: { min: 0.1, max: 0.45 },
};

/** Sól strumienia losowań ozdób skarbca (osobno od piedestałów i nagrody). */
export const SPIDER_VAULT_DECOR_SALT = 0x5ec8;

/** Pliki z generatora (względem strony) i ich klatki. */
export const SPIDER_VAULT_ART = {
  dir: 'assets/sprites/vault',
  pedestal: { key: 'vault-pedestal', frameWidth: 32, frameHeight: 40, frames: 4 },
  grand: { key: 'vault-pedestal-grand', frameWidth: 48, frameHeight: 48, frames: 4 },
  silk: { key: 'vault-silk', frameWidth: 48, frameHeight: 48, frames: 6 },
  slime: { key: 'vault-slime', frameWidth: 32, frameHeight: 32, frames: 4 },
  cornerWeb: { key: 'vault-corner-web', frameWidth: 64, frameHeight: 64, frames: 1 },
  curtain: { key: 'vault-curtain', frameWidth: 32, frameHeight: 32, frames: 3 },
  husk: { key: 'vault-husk', frameWidth: 32, frameHeight: 32, frames: 2 },
} as const;

/** Wygląd skarbca w świecie (px świata). */
export const SPIDER_VAULT_VISUAL = {
  /** Dół klatki piedestału poniżej środka kafla (cień kontaktowy wypada na kaflu piedestału). */
  pedestalFoot: 10,
  grandFoot: 12,
  /** Środek kokonu nad górą klatki piedestału (kokon stoi w gnieździe z jedwabiu na kapitelu). */
  cocoonAboveTop: -1,
  /** Kropla śluzu spływa po licu piedestału (kl./s, STYLEGUIDE §8: 6). */
  dripFps: 5,
  /** Zasłona wisi od wierzchu lica: tyle px nad dolną krawędzią kafla muru. */
  curtainTop: 8,
  /** Nici: kolor główny i połysk co `glintEvery` piksel (rampa SILK z generatora), cień nici na posadzce. */
  threadColor: 0xcac4d2,
  threadShade: 0xa59eaf,
  threadGlint: 0xe7e2ec,
  glintEvery: 5,
  threadShadowColor: 0x1b1a22,
  threadShadowAlpha: 0.4,
  /** Przesunięcie cienia nici w dół (px) — nić wisi w powietrzu nad posadzką. */
  threadShadowDrop: 3,
  /** Światło piedestałów (złoto i bioluminescencja w szczelinach): rozjaśnia mrok wokół kokonu. */
  lightRadius: 46,
  grandLightRadius: 72,
  /** Komunikat odsłonięcia. */
  toast: 'Skarbiec Króla Pająków! Rozbij kokony — w jednym czeka skarb.',
} as const;
