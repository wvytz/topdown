import type { BossDefinition } from '@/core/bossTypes';
import { BossAttackKind, BossId } from '@/core/bossTypes';
import type { EnemyScalingConfig, StatusResistance } from '@/core/combatTypes';
import { scaleForFloor } from '@/systems/CombatMath';

/** Pierwszy boss: „Strażnik Piętra”. Sekwencja: uderzenie → pierścień pocisków → ostrzał stref. */
export const FLOOR_GUARDIAN = {
  id: BossId.FloorGuardian,
  name: 'Strażnik Piętra',
  radius: 26,
  color: 0xb5452a,
  maxHp: 300,
  moveSpeed: 55,
  engageDistance: 90,
  openingDelayMs: 1200,
  restBetweenAttacksMs: 1100,
  pattern: [BossAttackKind.Slam, BossAttackKind.Nova, BossAttackKind.Barrage],
  slam: {
    radius: 100,
    telegraphMs: 900,
    recoveryMs: 400,
    damage: 18,
    knockback: 320,
  },
  nova: {
    projectileCount: 12,
    projectileSpeed: 190,
    projectileLifetimeMs: 2500,
    waves: 1,
    waveIntervalMs: 450,
    telegraphMs: 700,
    recoveryMs: 300,
    damage: 10,
    knockback: 140,
  },
  barrage: {
    zoneCount: 4,
    zoneRadius: 48,
    spread: 90,
    intervalMs: 250,
    telegraphMs: 800,
    recoveryMs: 300,
    damage: 14,
    knockback: 200,
  },
  enrage: {
    hpThreshold: 0.5,
    telegraphMultiplier: 0.75,
    restMultiplier: 0.6,
  },
} satisfies BossDefinition;

/**
 * „Matka Pająków” (krok 22): sama nie atakuje — w stałym rytmie składa za sobą pajączki-kamikaze,
 * które są zagrożeniem i żywą tarczą (strzał trafia najbliższy cel). Trzyma dystans od gracza.
 * Rytm wylęgu ≈ złożenie + odpoczynek po nim + przerwa między atakami.
 */
export const SPIDER_QUEEN = {
  id: BossId.SpiderQueen,
  name: 'Matka Pająków',
  radius: 28,
  color: 0x7a3a4a,
  maxHp: 300,
  moveSpeed: 45,
  engageDistance: 150,
  openingDelayMs: 900,
  restBetweenAttacksMs: 2200,
  // Krok 25 (feedback właściciela: walka za łatwa): wylęg na przemian z rzutem siecią za plecy gracza —
  // sieć odcina ucieczkę i spowalnia, pajączki szybciej dobiegają.
  pattern: [BossAttackKind.Brood, BossAttackKind.Web],
  web: {
    // Krótki zamach i lot: mało czasu na reakcję (feedback właściciela).
    telegraphMs: 300,
    flightMs: 350,
    behindDistance: 85,
    count: 1,
    fanDeg: 70,
    // Klatki rozrostu w arkuszu boss-web.png mają promienie startRadius..maxRadius (tools/lair_enemies.py).
    startRadius: 20,
    maxRadius: 60,
    spreadMs: 700,
    durationMs: 6000,
    // Jak lepkie pajęczyny leża (krok 23e).
    slow: { pct: 0.5, durationMs: 500 },
    recoveryMs: 300,
  },
  brood: {
    count: 2,
    maxAlive: 6,
    // 4 klatki złożenia w 6 kl./s; pajączek wylęga się 30 px za pivotem (sprite, kolumna 7).
    birthMs: 667,
    spawnDistance: 30,
    spreadDeg: 70,
    recoveryMs: 300,
  },
  spiderling: {
    radius: 8,
    maxHp: 1,
    moveSpeed: 135,
    primeRange: 36,
    fuseMs: 3500,
    // 4 klatki zapłonu w 6 kl./s.
    primeMs: 667,
    blastRadius: 40,
    damage: 12,
    knockback: 240,
  },
  enrage: {
    hpThreshold: 0.5,
    telegraphMultiplier: 0.75,
    restMultiplier: 0.6,
  },
} satisfies BossDefinition;

/** Boss na konkretnych piętrach; pozostałe piętra mają Strażnika (krok 22: Matka Pająków na piętrze 2). */
export const BOSS_BY_FLOOR: Readonly<Record<number, BossDefinition>> = {
  2: SPIDER_QUEEN,
};

export function bossForFloor(floor: number): BossDefinition {
  return BOSS_BY_FLOOR[floor] ?? FLOOR_GUARDIAN;
}

/** Kraty areny bossa. */
export const ARENA_GATES = {
  /**
   * Kraty opadają dopiero, gdy gracz stoi co najmniej tyle kafli od krawędzi areny,
   * żeby nie spadły na niego w przejściu (gracz ma 24 px, kafel 32 px).
   */
  sealMarginTiles: 1,
  shakeDurationMs: 180,
  shakeIntensity: 0.006,
  /** Czas jednej klatki opadania/podnoszenia kraty (obraz; kolizja zmienia się od razu). */
  frameMs: 90,
} as const;

/** Skalowanie HP i obrażeń wszystkich ataków bossa (także wybuchów pajączków) do piętra. */
export function scaleBossForFloor<T extends BossDefinition>(boss: T, floor: number, scaling: EnemyScalingConfig): T {
  const dmg = <A extends { readonly damage: number }>(attack: A | undefined): A | undefined =>
    attack && { ...attack, damage: scaleForFloor(attack.damage, floor, scaling.damagePerFloor) };
  return {
    ...boss,
    maxHp: scaleForFloor(boss.maxHp, floor, scaling.hpPerFloor),
    ...(boss.slam && { slam: dmg(boss.slam) }),
    ...(boss.nova && { nova: dmg(boss.nova) }),
    ...(boss.barrage && { barrage: dmg(boss.barrage) }),
    ...(boss.spiderling && { spiderling: dmg(boss.spiderling) }),
  };
}

/**
 * Boss znosi efekty gorzej niż zwykli wrogowie: ogłuszenie trwa 40% czasu, a potem
 * przez 3 s jest na nie odporny (serią strzał nie da się go zablokować). Spowolnienie ma połowę siły.
 */
export const BOSS_STATUS_RESISTANCE: StatusResistance = {
  stunMultiplier: 0.4,
  stunImmunityMs: 3000,
  slowMultiplier: 0.5,
};
