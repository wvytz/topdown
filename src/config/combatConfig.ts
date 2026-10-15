import type {
  EnemyDefinition,
  EnemyScalingConfig,
  EnemyViewRule,
  PlayerCombatConfig,
  StatusResistance,
} from '@/core/combatTypes';
import { EnemyAttackKind, EnemyType, EnemyVariant } from '@/core/combatTypes';
import type { EnemyVariantDefinition } from '@/systems/EnemyVariants';
import type { EncounterConfig } from '@/dungeon/EncounterPlanner';
import { GUARANTEED_VIEW_HALF } from '@/config/gameConfig';
import { ITEM_EFFECTS } from '@/config/lootConfig';

export const PLAYER_COMBAT: PlayerCombatConfig = {
  meleeDamage: 12,
  meleeRange: 52,
  meleeArcDeg: 110,
  attackCooldownMs: 320,
  knockback: 260,
  invulnerabilityMs: 600,
  dash: {
    speed: 620,
    durationMs: 150,
    cooldownMs: 700,
  },
  // Strzał jest słabszy od ciosu wręcz: uzupełnienie walki (dobijanie, Kitery), nie zamiennik.
  ranged: {
    damage: 7,
    knockback: 90,
    projectileSpeed: 460,
    projectileLifetimeMs: 650,
    projectileRadius: 4,
    maxCharges: 3,
    rechargeMs: 1400,
    shotIntervalMs: 200,
  },
};

/** Na razie dwa podstawowe archetypy z GDD: wręcz (Rusher) i dystansowy (Kiter). */
export const ENEMY_DEFINITIONS: Readonly<Record<EnemyType, EnemyDefinition>> = {
  [EnemyType.Rusher]: {
    type: EnemyType.Rusher,
    variant: EnemyVariant.TrashcanMan,
    radius: 11,
    color: 0xd9534f,
    maxHp: 30,
    moveSpeed: 115,
    behaviour: { aggroRange: 260 },
    attack: {
      kind: EnemyAttackKind.Melee,
      damage: 10,
      range: 32,
      hitRange: 42,
      windupMs: 350,
      cooldownMs: 1000,
      knockback: 220,
    },
  },
  [EnemyType.Kiter]: {
    type: EnemyType.Kiter,
    variant: EnemyVariant.DemonMage,
    radius: 10,
    color: 0x9b6bd6,
    maxHp: 20,
    moveSpeed: 90,
    behaviour: {
      aggroRange: 300,
      kiting: { preferredRange: 200, retreatRange: 130 },
    },
    attack: {
      kind: EnemyAttackKind.Projectile,
      damage: 8,
      range: 280,
      windupMs: 400,
      cooldownMs: 1500,
      knockback: 120,
      projectileSpeed: 240,
      projectileLifetimeMs: 2000,
    },
  },
};

/**
 * Warianty archetypów (krok 23b). Bez nadpisań = statystyki i atak archetypu.
 * Nietoperz: ten sam rytm i obrażenia co mag, ale fala-półksiężyc (26 px szerokości) — trudniej ją ominąć
 * bokiem, więc leci wolniej; przez dash przelatuje jak każdy pocisk.
 */
export const ENEMY_VARIANTS: Readonly<Record<EnemyVariant, EnemyVariantDefinition>> = {
  [EnemyVariant.TrashcanMan]: { type: EnemyType.Rusher },
  [EnemyVariant.DemonMage]: { type: EnemyType.Kiter },
  [EnemyVariant.CaveSpider]: { type: EnemyType.Rusher, color: 0x3c272a },
  [EnemyVariant.Bat]: {
    type: EnemyType.Kiter,
    color: 0x4a3644,
    attack: {
      kind: EnemyAttackKind.Projectile,
      damage: 8,
      range: 280,
      windupMs: 400,
      cooldownMs: 1500,
      knockback: 120,
      projectileSpeed: 200,
      projectileLifetimeMs: 2000,
      wave: { halfWidth: 13, halfDepth: 4 },
    },
  },
  // Grzybnia (krok 28b): zarażony pająk gryzie jak Rusher, ale lekko zatruwa (2 co 0,5 s przez 1,5 s = 6).
  [EnemyVariant.InfectedSpider]: {
    type: EnemyType.Rusher,
    color: 0x3a2f3c,
    attack: {
      kind: EnemyAttackKind.Melee,
      damage: 10,
      range: 32,
      hitRange: 42,
      windupMs: 350,
      cooldownMs: 1000,
      knockback: 220,
      status: { poison: { tickDamage: 2, tickMs: 500, durationMs: 1500 } },
    },
  },
  // Grzybiec: kula zarodników słabsza od kuli maga (5), ale zatruwa jak Ognista pięść (12 w 2 s);
  // wolniejsza (170 zamiast 240) i z dłuższym zamachem, żeby w mgle dało się ją zobaczyć i ominąć.
  [EnemyVariant.Fungoid]: {
    type: EnemyType.Kiter,
    color: 0x8a4a2a,
    attack: {
      kind: EnemyAttackKind.Projectile,
      damage: 5,
      range: 280,
      windupMs: 450,
      cooldownMs: 1600,
      knockback: 100,
      projectileSpeed: 170,
      projectileLifetimeMs: 2200,
      status: {
        poison: {
          tickDamage: ITEM_EFFECTS.fireFist.tickDamage,
          tickMs: ITEM_EFFECTS.fireFist.tickMs,
          durationMs: ITEM_EFFECTS.fireFist.durationMs,
        },
      },
    },
  },
  // Cmentarzysko (krok 32b): zarażony drapie mocniej niż pająk (11), ale z dłuższym zamachem (420 ms) —
  // ciężki, czytelny cios pazurami; zatruwa jak zarażony pająk (6 w 1,5 s).
  [EnemyVariant.Zombie]: {
    type: EnemyType.Rusher,
    color: 0x6a3a2a,
    attack: {
      kind: EnemyAttackKind.Melee,
      damage: 11,
      range: 32,
      hitRange: 42,
      windupMs: 420,
      cooldownMs: 1100,
      knockback: 220,
      status: { poison: { tickDamage: 2, tickMs: 500, durationMs: 1500 } },
    },
  },
  // Siewca: pluje jak grzybiec (ta sama kula zarodników i trucizna) — grzyb z Grzybni rośnie mu zamiast głowy.
  [EnemyVariant.Sower]: {
    type: EnemyType.Kiter,
    color: 0x5a3a6a,
    attack: {
      kind: EnemyAttackKind.Projectile,
      damage: 5,
      range: 280,
      windupMs: 450,
      cooldownMs: 1600,
      knockback: 100,
      projectileSpeed: 170,
      projectileLifetimeMs: 2200,
      status: {
        poison: {
          tickDamage: ITEM_EFFECTS.fireFist.tickDamage,
          tickMs: ITEM_EFFECTS.fireFist.tickMs,
          durationMs: ITEM_EFFECTS.fireFist.durationMs,
        },
      },
    },
  },
  // Piekło (krok 41d, propozycja przyjęta przez właściciela). Piekielny ogar: szybszy od innych Rusherów;
  // z dystansu skacze po prostej w miejsce gracza z chwili zamachu (telegraf: linia i przysiad), chybiony
  // skok zostawia go na chwilę bez ruchu. Za skokiem zostaje smuga żaru.
  [EnemyVariant.Hellhound]: {
    type: EnemyType.Rusher,
    color: 0x8a5a40,
    moveSpeed: 150,
    attack: {
      kind: EnemyAttackKind.Pounce,
      damage: 12,
      range: 110,
      windupMs: 450,
      cooldownMs: 1800,
      knockback: 240,
      speed: 460,
      maxDistance: 140,
      hitRadius: 14,
      missRecoveryMs: 700,
      trail: { spacing: 14, radius: 9, durationMs: 1500, damage: 4 },
    },
  },
  // Kultysta popiołu: rzuca łukiem bombę smolną w miejsce gracza; strefa upadku widoczna przez cały lot,
  // po wybuchu płonie kałuża (odcina drogę, zagania na paleniska).
  [EnemyVariant.Cultist]: {
    type: EnemyType.Kiter,
    color: 0xa09070,
    attack: {
      kind: EnemyAttackKind.Lob,
      damage: 10,
      range: 230,
      windupMs: 550,
      cooldownMs: 2400,
      knockback: 160,
      flightMs: 750,
      blastRadius: 30,
      patch: { radius: 26, durationMs: 2500, damage: 4 },
    },
  },
};

/** Wrogowie strzelają tylko z widoku gracza (krok 18): przy zoomie 2,0 widać mniej świata niż przy 1,5. */
export const ENEMY_VIEW_RULE: EnemyViewRule = {
  halfX: GUARANTEED_VIEW_HALF.x,
  halfY: GUARANTEED_VIEW_HALF.y,
  margin: 16,
  retreatSlack: 8,
};

export const ENEMY_SCALING: EnemyScalingConfig = {
  hpPerFloor: 0.15,
  damagePerFloor: 0.1,
};

export const PROJECTILE_RADIUS = 4;

/** Zwykli wrogowie: pełne efekty, krótka odporność na ponowne ogłuszenie. */
export const ENEMY_STATUS_RESISTANCE: StatusResistance = {
  stunMultiplier: 1,
  // Ogłuszenie 0,9 s + odporność 1,2 s: Elektryczną strzałą da się trzymać wroga w ogłuszeniu najwyżej ok. 43% czasu.
  stunImmunityMs: 1200,
  slowMultiplier: 1,
};

/** Gracz (krok 23d: spowolnienie z kokonów leża) — pełna siła spowolnienia; ogłuszeń gracz dziś nie dostaje. */
export const PLAYER_STATUS_RESISTANCE: StatusResistance = {
  // Krok 29: po paraliżu 2 s odporności — paraliż to kara za błąd, nie pętla bez wyjścia.
  paralysisImmunityMs: 2000,
  stunMultiplier: 0,
  stunImmunityMs: 0,
  slowMultiplier: 1,
};

/**
 * Celowo mało przeciwników: 1–2 na pokój. Liczba rośnie tylko razem z liczbą pokojów,
 * a trudność głównie przez ENEMY_SCALING (HP/obrażenia).
 */
export function getEncounterConfigForFloor(floor: number): EncounterConfig {
  return {
    enemiesPerRoom: { min: 1, max: 2 },
    kiterChance: floor === 1 ? 0.25 : 0.35,
  };
}
