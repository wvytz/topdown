import type {
  BroodAttackDefinition,
  EnemyDefinition,
  EnemyScalingConfig,
  EnemyViewRule,
  PlayerCombatConfig,
  StatusApplication,
  StatusResistance,
} from '@/core/combatTypes';
import { EnemyAttackKind, EnemyType, EnemyVariant } from '@/core/combatTypes';
import type { EnemyVariantDefinition } from '@/systems/EnemyVariants';
import type { EncounterConfig } from '@/dungeon/EncounterPlanner';
import type { HomingConfig } from '@/systems/Homing';
import { GUARANTEED_VIEW_HALF } from '@/config/gameConfig';
import { ITEM_EFFECTS } from '@/config/lootConfig';
import { TOWER_CONFIG } from '@/config/towerConfig';
import { towerLoop } from '@/systems/TowerLoop';

export const PLAYER_COMBAT: PlayerCombatConfig = {
  // Krok 145 (`#decyzja` właściciela „za mały damage”): obrażenia bohaterów ×1,25 — cios 12 → 15.
  meleeDamage: 15,
  meleeRange: 52,
  meleeArcDeg: 110,
  attackCooldownMs: 320,
  knockback: 260,
  invulnerabilityMs: 600,
  // Krok 117 (ocena właściciela: dash za długi na pokoje 5–10 kafli): 620 × 150 ms ≈ 93 px (prawie 3 kafle)
  // → 500 × 140 ms = 70 px (ok. 2 kafle); nietykalność dasha prawie bez zmian (= czas trwania).
  dash: {
    speed: 500,
    durationMs: 140,
    cooldownMs: 700,
  },
  // Strzał jest słabszy od ciosu wręcz: uzupełnienie walki (dobijanie, Kitery), nie zamiennik.
  ranged: {
    damage: 9,
    knockback: 90,
    projectileSpeed: 460,
    projectileLifetimeMs: 650,
    projectileRadius: 4,
    maxCharges: 3,
    rechargeMs: 1400,
    shotIntervalMs: 200,
  },
};

/**
 * Krok 146 (decyzja właściciela: „strzały Barby powinny być auto naprowadzane”, bo bohaterowie dystansowi
 * są najmocniejsi): strzał barbarzyńcy skręca do celu przed sobą. Skręt 480°/s przy 460 px/s to łuk
 * o promieniu ok. 55 px — trafia biegnącego Kitera, ale nie zawraca do wrogów za plecami (stożek ±70°).
 */
export const BARBARIAN_SHOT_HOMING: HomingConfig = {
  range: 200,
  coneHalfDeg: 70,
  turnRateDegPerSec: 480,
};

/**
 * Archetypy: wręcz (Rusher) i dystansowy (Kiter) z GDD oraz Gniazdownik (krok 122, wybór właściciela) —
 * przywoływacz, który ożywia pokój kruchymi stworkami i sam jest celem do wybicia w pierwszej kolejności.
 */
export const ENEMY_DEFINITIONS: Readonly<Record<EnemyType, EnemyDefinition>> = {
  [EnemyType.Rusher]: {
    type: EnemyType.Rusher,
    variant: EnemyVariant.TrashcanMan,
    radius: 11,
    color: 0xd9534f,
    maxHp: 33, // krok 145: cios bohatera 12 → 15, Rusher dalej pada od 3 ciosów
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
  // Gniazdownik: wolny i trzyma dystans jak Kiter (ucieka wolniej, niż chodzi bohater — da się go dopaść);
  // co 4,5 s zamach 0,8 s (worek pęcznieje) i 2 czerwie. Najwyżej 4 żywe naraz, 10 na całe życie gniazda.
  // Sam nie rani. Czerwie giną razem z gniazdem — szybkie zabicie gniazda ucisza pokój.
  [EnemyType.Nester]: {
    type: EnemyType.Nester,
    variant: EnemyVariant.BroodSac,
    radius: 12,
    color: 0xb07a62,
    maxHp: 35,
    moveSpeed: 45,
    behaviour: {
      aggroRange: 260,
      kiting: { preferredRange: 170, retreatRange: 120 },
    },
    attack: {
      kind: EnemyAttackKind.Brood,
      damage: 0,
      range: 230,
      windupMs: 800,
      cooldownMs: 4500,
      knockback: 0,
      count: 2,
      maxAlive: 4,
      total: 10,
      spawnDistance: 20,
      spreadDeg: 90,
      hatchMs: 400,
      minion: EnemyVariant.Grub,
    },
  },
  // Czyhacz (krok 123): z kryjówki doskokiem (strefa lądowania, LURKER_CONFIG), potem szybszy od Rushera
  // (+15%) i twardszy (ok. ×1,2 HP — więcej łamałoby regułę „≤ 7 ciosów na piętrze 10”); tnie seriami po 2 ciosy, po serii 0,8 s zadyszki — okno na kontrę.
  [EnemyType.Lurker]: {
    type: EnemyType.Lurker,
    variant: EnemyVariant.StoneLurker,
    radius: 11,
    color: 0x8a8478,
    maxHp: 35,
    moveSpeed: 132,
    behaviour: { aggroRange: 320 },
    attack: {
      kind: EnemyAttackKind.Melee,
      damage: 10,
      range: 32,
      hitRange: 42,
      windupMs: 300,
      cooldownMs: 1600,
      knockback: 200,
      series: { hits: 2, gapMs: 220, breatherMs: 800 },
    },
  },
};

/** Wylęg Gniazdownika (krok 122) z innym stworkiem — rytm i limity jak u archetypu. */
function broodAttack(minion: EnemyVariant): BroodAttackDefinition {
  const attack = ENEMY_DEFINITIONS[EnemyType.Nester].attack as BroodAttackDefinition;
  return { ...attack, minion };
}

/**
 * Stworek z gniazda (krok 122): kruchy (cios barbarzyńcy go zabija), szybki, gryzie słabo i krótko — groźny tylko
 * w gromadzie. Wersje biomów różnią się kolorem plamy i ewentualnie lekkim statusem.
 */
function broodling(color: number, status?: StatusApplication): EnemyVariantDefinition {
  return {
    type: EnemyType.Rusher,
    color,
    radius: 7,
    maxHp: 8,
    moveSpeed: 145,
    attack: {
      kind: EnemyAttackKind.Melee,
      damage: 4,
      range: 22,
      hitRange: 30,
      windupMs: 280,
      cooldownMs: 900,
      knockback: 70,
      ...(status && { status }),
    },
  };
}

/** Lekka trucizna stworków Grzybni i Cmentarzyska: 2 co 0,5 s przez 1 s. */
const BROODLING_POISON: StatusApplication = { poison: { tickDamage: 2, tickMs: 500, durationMs: 1000 } };

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
  // Zadymiona palarnia (krok 84): wielki czarny dog — większy, szybszy i twardszy od zwykłego Rushera, gryzie z krótkim
  // zamachem (400 ms); bez statusów. Wypada też ze ściany pokoju (WallDogManager).
  [EnemyVariant.BlackDog]: {
    type: EnemyType.Rusher,
    color: 0x2a2a34,
    radius: 14,
    maxHp: 45,
    moveSpeed: 140,
    attack: {
      kind: EnemyAttackKind.Melee,
      damage: 12,
      range: 36,
      hitRange: 48,
      windupMs: 400,
      cooldownMs: 1100,
      knockback: 240,
    },
  },
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
  // Zasadzki (krok 49): upiór przenika: 2,4 s cielesny, 0,9 s bezcielesny (nietykalny, nie atakuje).
  // Krok 49a (właściciel): zasadzka ma być nagrodą o niskim ryzyku, ale intensywną walką — upiory liczniejsze,
  // ale kruche i słabe: 20 HP, dotyk 4 obrażenia (dłuższy zamach 500 ms), lekkie spowolnienie 15% na 0,8 s.
  [EnemyVariant.Ghost]: {
    type: EnemyType.Rusher,
    color: 0xb8d8e8,
    maxHp: 20,
    moveSpeed: 100,
    phasing: { solidMs: 2400, phasedMs: 900 },
    attack: {
      kind: EnemyAttackKind.Melee,
      damage: 4,
      range: 30,
      hitRange: 40,
      windupMs: 500,
      cooldownMs: 1100,
      knockback: 90,
      status: { slow: { pct: 0.15, durationMs: 800 } },
    },
  },
  // Gniazdownicy biomów (krok 122a): ten sam rytm wylęgu, inny wygląd i stworek. Ruiny — worek z czerwiami.
  [EnemyVariant.BroodSac]: { type: EnemyType.Nester },
  [EnemyVariant.Grub]: broodling(0xd8c49a),
  // Leże: pajęczaki spowalniają jak pajęczyny leża (15% na 0,8 s).
  [EnemyVariant.SilkMother]: { type: EnemyType.Nester, color: 0xd8d0e0, attack: broodAttack(EnemyVariant.Hatchling) },
  [EnemyVariant.Hatchling]: broodling(0x3c272a, { slow: { pct: 0.15, durationMs: 800 } }),
  // Grzybnia i Cmentarzysko: stworki lekko zatruwają (jak wrogowie tych biomów, ale słabiej: 2 + 2).
  [EnemyVariant.Puffcap]: { type: EnemyType.Nester, color: 0xc8b890, attack: broodAttack(EnemyVariant.Sporeling) },
  [EnemyVariant.Sporeling]: broodling(0x8a4a2a, BROODLING_POISON),
  [EnemyVariant.Necromancer]: { type: EnemyType.Nester, color: 0x6a3a2a, attack: broodAttack(EnemyVariant.CrawlingHand) },
  [EnemyVariant.CrawlingHand]: broodling(0x9aa4b0, BROODLING_POISON),
  // Piekło i palarnia: stworki bez statusu (ogień biomu robią już ogary, kultyści i paleniska).
  [EnemyVariant.ImpMother]: { type: EnemyType.Nester, color: 0x8a2a20, attack: broodAttack(EnemyVariant.Imp) },
  [EnemyVariant.Imp]: broodling(0xa03020),
  [EnemyVariant.Hookah]: { type: EnemyType.Nester, color: 0x3a8a8a, attack: broodAttack(EnemyVariant.SmokeWisp) },
  [EnemyVariant.SmokeWisp]: broodling(0xb8b8b0),
  // Czyhacze biomów (krok 123): ten sam archetyp, inna kryjówka i kolor (posoka, gruz przy wyskoku).
  [EnemyVariant.StoneLurker]: { type: EnemyType.Lurker },
  [EnemyVariant.SilkLurker]: { type: EnemyType.Lurker, color: 0xd8d0e0 },
  [EnemyVariant.MoundLurker]: { type: EnemyType.Lurker, color: 0x7a6a4a },
  [EnemyVariant.CoffinLurker]: { type: EnemyType.Lurker, color: 0x6a4a32 },
  [EnemyVariant.CinderLurker]: { type: EnemyType.Lurker, color: 0xc0401c },
  [EnemyVariant.BarrelLurker]: { type: EnemyType.Lurker, color: 0x7a5a3a },
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

/**
 * Skalowanie bossów (krok 145, `#decyzja` właściciela: walki z bossami za długie, „przeskaluj HP”): HP rośnie
 * o 6% na piętro zamiast 15% (wiedźma na piętrze 8 miała 2× bazowe HP, a obrażenia bohatera nie rosną).
 * Bazowe HP w `bossConfig.ts` podniesione tak, by pierwsze piętra zostały równie trudne. Obrażenia jak u wrogów.
 */
export const BOSS_SCALING: EnemyScalingConfig = {
  hpPerFloor: 0.06,
  damagePerFloor: ENEMY_SCALING.damagePerFloor,
};

export const PROJECTILE_RADIUS = 4;

/**
 * Strefa trafienia bohatera (krok 110). Ciało fizyczne 24×24 zostaje do ruchu i ścian, a trafienia liczymy
 * z tym, co gracz widzi:
 * - `ground` — ślad stóp dla stref na ziemi (telegrafowane koła bossów, bomby, wybuchy): środek cienia pod
 *   postacią (`offsetY` jak `groundShadow` bohaterów) i mały promień — trafia, gdy czerwień przykryje cień;
 * - `body` — tułów dla pocisków w locie (postać ma ok. 16 px szerokości bez broni).
 */
export const HERO_HURTBOX = {
  ground: { offsetY: 4, radius: 5 },
  body: { radius: 8 },
} as const;

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
 * Gniazdownik (krok 122) zastępuje jednego z nich co kilka pokojów; jego czerwie są poza tym limitem
 * (decyzja właściciela — lokacje były zbyt puste). Na piętrze 1 rzadziej (nauka).
 */
export function getEncounterConfigForFloor(floor: number): EncounterConfig {
  return {
    enemiesPerRoom: { min: 1, max: 2 },
    kiterChance: floor === 1 ? 0.25 : 0.35,
    nester: { roomChance: floor === 1 ? 0.2 : 0.3, minRoomSide: 6, maxPerFloor: 3 },
    // Czyhacz (krok 123): rzadszy od gniazda — 1 na piętro w pierwszym kręgu wieży, potem 2.
    lurker: { roomChance: 0.12, minRoomSide: 5, maxPerFloor: towerLoop(floor, TOWER_CONFIG) > 0 ? 2 : 1 },
  };
}
