import type { BossDefinition } from '@/core/bossTypes';
import { BossAttackKind, BossId, PatternOrder } from '@/core/bossTypes';
import type { EnemyScalingConfig, StatusResistance } from '@/core/combatTypes';
import { scaleForFloor } from '@/systems/CombatMath';
import { ITEM_EFFECTS } from '@/config/lootConfig';

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
  // Lekka losowość (krok 31, prośba właściciela): każdy atak raz na rundę, w losowej kolejności.
  patternOrder: PatternOrder.Shuffled,
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
 * „Matka Pająków” (krok 22, królewska od kroku 26): trzyma dystans, a walczy zewem — pajączki-kamikaze
 * spadają z sufitu pierścieniem wokół gracza (zagrożenie i żywa tarcza: strzał trafia najbliższy cel),
 * siecią za plecy gracza i królewskim skokiem na jego miejsce.
 */
export const SPIDER_QUEEN = {
  id: BossId.SpiderQueen,
  name: 'Matka Pająków',
  title: 'Królowa Pajęczego Leża',
  enragedLabel: 'Królewski gniew!',
  radius: 28,
  color: 0x7a3a4a,
  maxHp: 300,
  // Krok 27 (feedback właściciela: dalej za łatwo): królowa poluje — z daleka sprintem dopada gracza
  // (wolniej niż gracz 200, ale spowolniony siecią nie ucieknie), z bliska podchodzi i smaga nogami.
  moveSpeed: 70,
  sprint: { speed: 150, distance: 110 },
  // Ciała stykają się przy 40 px (28 + 12) — królowa staje tuż przy graczu.
  engageDistance: 44,
  openingDelayMs: 900,
  // Krok 26: trzy ataki w cyklu, krótsza przerwa (feedback właściciela: walka „banalnie łatwa”).
  restBetweenAttacksMs: 1600,
  // Krok 25: sieć za plecy gracza odcina ucieczkę; krok 26: wylęg z sufitu osacza, a skok karze stanie w miejscu.
  pattern: [BossAttackKind.Brood, BossAttackKind.Web, BossAttackKind.Leap],
  // Lekka losowość (krok 31, prośba właściciela): każdy atak raz na rundę, w losowej kolejności.
  patternOrder: PatternOrder.Shuffled,
  lash: {
    // Gracz bliżej niż 56 px od środka królowej; strefa sięga 34 + 30 = 64 px.
    triggerRange: 56,
    reach: 34,
    radius: 30,
    telegraphMs: 420,
    recoveryMs: 350,
    cooldownMs: 900,
    damage: 10,
    knockback: 220,
    // Trucizna = podpalenie z jednej kopii Ognistej pięści (decyzja właściciela).
    status: {
      poison: {
        tickDamage: ITEM_EFFECTS.fireFist.tickDamage,
        tickMs: ITEM_EFFECTS.fireFist.tickMs,
        durationMs: ITEM_EFFECTS.fireFist.durationMs,
      },
    },
  },
  leap: {
    telegraphMs: 650,
    flightMs: 450,
    radius: 52,
    damage: 16,
    knockback: 300,
    // Po lądowaniu królowa stoi — okno na kontrę wręcz.
    recoveryMs: 500,
  },
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
    // Krok 26: pierścień 4 (po wściekłości 5) pajączków z sufitu, po kolei — gracz osaczony.
    count: 4,
    maxAlive: 8,
    // Zew = 4 klatki złożenia w 6 kl./s.
    birthMs: 667,
    ringRadius: 64,
    ringJitterDeg: 20,
    dropIntervalMs: 160,
    fallMs: 600,
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

/**
 * „Król Pająków” (krok 29, Grzybnia): pająk zainfekowany grzybem — większy i cięższy od Matki Pająków.
 * Ciosy (moje, do strojenia w teście właściciela):
 * - ścięcie kosami z bliska (mechanika smagnięcia): mocny cios z paraliżem;
 * - grad sztyletów: seria ukłuć w linii w stronę gracza;
 * - rzut kokonem: kokon ląduje na graczu i paraliżuje (po wściekłości drugi za graczem);
 * - wysyp grzybni: płaty trującej grzybni wokół gracza leżą długo — arena z czasem zarasta.
 */
export const SPIDER_KING = {
  id: BossId.SpiderKing,
  name: 'Król Pająków',
  title: 'Zainfekowany Władca Grzybni',
  enragedLabel: 'Gniew Grzybni!',
  radius: 34,
  color: 0x6a8a3a,
  maxHp: 420,
  // Ciężki: chodzi powoli, ale nie odpuszcza — podchodzi na odległość kos.
  moveSpeed: 55,
  engageDistance: 52,
  openingDelayMs: 1200,
  restBetweenAttacksMs: 1500,
  pattern: [BossAttackKind.Bloom, BossAttackKind.Flurry, BossAttackKind.CocoonThrow],
  // Lekka losowość (krok 31, prośba właściciela): każdy atak raz na rundę, w losowej kolejności.
  patternOrder: PatternOrder.Shuffled,
  // Ścięcie kosami: wolny, czytelny zamach, ale trafienie boli i paraliżuje.
  lash: {
    triggerRange: 70,
    reach: 40,
    radius: 40,
    telegraphMs: 650,
    recoveryMs: 600,
    cooldownMs: 1400,
    damage: 18,
    knockback: 320,
    status: { paralysis: { durationMs: 700 } },
  },
  flurry: {
    count: 6,
    startDistance: 30,
    step: 22,
    radius: 18,
    intervalMs: 110,
    telegraphMs: 500,
    recoveryMs: 400,
    damage: 8,
    knockback: 140,
  },
  cocoonThrow: {
    telegraphMs: 450,
    flightMs: 650,
    radius: 34,
    count: 1,
    behindDistance: 80,
    paralysis: { durationMs: 1200 },
    recoveryMs: 400,
    damage: 6,
    knockback: 0,
  },
  bloom: {
    telegraphMs: 800,
    count: 3,
    ring: { min: 55, max: 100 },
    startRadius: 14,
    maxRadius: 40,
    spreadMs: 1000,
    durationMs: 14000,
    poison: { tickDamage: 2, tickMs: 500, durationMs: 1000 },
    slow: { pct: 0.35, durationMs: 400 },
    recoveryMs: 300,
  },
  enrage: {
    hpThreshold: 0.5,
    telegraphMultiplier: 0.75,
    restMultiplier: 0.6,
  },
} satisfies BossDefinition;

/**
 * Boss Cmentarzyska „Grzybowy Pożeracz” (krok 33 jako Wampirzy Lord, pomysł właściciela; od kroku 34 wygląd
 * z paczki właściciela): ciało dawnego władcy wieży przerośnięte grzybnią, głowa pęka w paszczę; hoduje
 * zarażonych w kokonach (spiżarnia) i je zjada — uczta leczy go i wzmacnia.
 * Ciosy (moje, do strojenia w teście): kąsanie z bliska (leczy go), szarża z kłapnięciem (skok),
 * zamach łapami (`cleave`, dawny tasak), zew spiżarni.
 */
export const FUNGAL_DEVOURER = {
  id: BossId.FungalDevourer,
  name: 'Grzybowy Pożeracz',
  title: 'Ucztujący w Kryptach',
  enragedLabel: 'Głód!',
  radius: 28,
  color: 0x6a1e24,
  maxHp: 460,
  moveSpeed: 60,
  sprint: { speed: 135, distance: 150 },
  engageDistance: 50,
  openingDelayMs: 1200,
  restBetweenAttacksMs: 1500,
  pattern: [BossAttackKind.Cleave, BossAttackKind.Leap, BossAttackKind.Call],
  patternOrder: PatternOrder.Shuffled,
  // Kąsanie paszczą: szybkie, z bliska; trafienie leczy Pożeracza.
  lash: {
    triggerRange: 62,
    reach: 34,
    radius: 30,
    telegraphMs: 450,
    recoveryMs: 400,
    cooldownMs: 1300,
    damage: 12,
    knockback: 200,
    healOnHit: 12,
  },
  // Szarża z kłapnięciem: doskok na miejsce gracza (mechanika królewskiego skoku).
  leap: {
    telegraphMs: 600,
    flightMs: 400,
    radius: 46,
    damage: 15,
    knockback: 280,
    recoveryMs: 500,
  },
  // Zamach łapami (do kroku 33 tasak): wolny, szeroki — uważny gracz zdąży uciec, a trafienie boli.
  cleave: {
    reach: 42,
    radius: 46,
    telegraphMs: 800,
    recoveryMs: 600,
    damage: 22,
    knockback: 340,
  },
  call: {
    telegraphMs: 700,
    count: 1,
    recoveryMs: 300,
  },
  feast: {
    larders: { count: { min: 4, max: 6 }, wallMarginTiles: 1, minSpacingTiles: 3, centerClearTiles: 3 },
    larderRadius: 12,
    firstAfterMs: 7000,
    cooldownMs: 11000,
    enragedCooldownMs: 6500,
    reach: 40,
    durationMs: 1000,
    heal: 40,
    damagePerStack: 0.15,
    speedPerStack: 0.1,
    maxStacks: 4,
  },
  enrage: {
    hpThreshold: 0.5,
    telegraphMultiplier: 0.8,
    restMultiplier: 0.65,
  },
} satisfies BossDefinition;

/**
 * „Strażnik Bram” (krok 41e, piętro 5 — opcja A właściciela): mniejszy brat Kata Otchłani, uczy obchodzenia
 * tarczy. Tarcza z przodu odbija pociski, zatrzymuje promień i przyjmuje połowę ciosu; obraca się wolno, a w ataku
 * wcale. Ciosy: wirujący łańcuch dookoła (karze stanie za plecami) i uderzenie tarczą przed sobą.
 * Bez haka i pierścienia ognia — te dostaje Kat. Liczby moje, do strojenia w teście.
 */
export const GATE_WARDEN = {
  id: BossId.GateWarden,
  name: 'Strażnik Bram',
  title: 'Odźwierny Otchłani',
  enragedLabel: 'Żar w żyłach!',
  radius: 30,
  color: 0x8a2a1a,
  maxHp: 420,
  moveSpeed: 62,
  engageDistance: 56,
  openingDelayMs: 1200,
  restBetweenAttacksMs: 1300,
  pattern: [BossAttackKind.Cleave, BossAttackKind.Slam],
  patternOrder: PatternOrder.Shuffled,
  shield: {
    arcDeg: 120,
    turnRateDegPerSec: 110,
    frontMeleeMultiplier: 0.5,
    reflectSpeed: 0.8,
  },
  // Wirujący łańcuch: hak okrąża bossa — strefa dookoła, także za plecami.
  slam: {
    radius: 92,
    telegraphMs: 900,
    recoveryMs: 700,
    damage: 18,
    knockback: 320,
  },
  // Uderzenie tarczą: przed bossem, szybkie i ciężkie; potem chwila na obejście go.
  cleave: {
    reach: 40,
    radius: 44,
    telegraphMs: 650,
    recoveryMs: 800,
    damage: 20,
    knockback: 360,
  },
  enrage: {
    hpThreshold: 0.5,
    telegraphMultiplier: 0.8,
    restMultiplier: 0.65,
  },
} satisfies BossDefinition;

/**
 * „Kat Otchłani” (krok 41f, boss piętra 6 — propozycja przyjęta przez właściciela): demon z tarczą-wrotami
 * i łańcuchem z hakiem. Jedyny boss, którego trzeba obchodzić, i jedyny, który sam przyciąga gracza.
 * - tarcza jak u Strażnika Bram, a promień w nią rozgrzewa żelazo — po chwili wybuch żaru wokół Kata;
 * - hak (poza wzorem) na gracza trzymającego dystans: przyciąga pod tarczę, potem uderzenie tarczą;
 * - wirujący łańcuch dookoła i uderzenie tarczą przed sobą;
 * - oddech palenisk: cztery paleniska areny buchają naraz;
 * - wściekłość: brzeg areny płonie, wolne koło w środku się kurczy — nie da się kitować pod ścianą.
 * Liczby moje, do strojenia w teście właściciela.
 */
export const ABYSS_EXECUTIONER = {
  id: BossId.AbyssExecutioner,
  name: 'Kat Otchłani',
  title: 'Pan Łańcuchów',
  enragedLabel: 'Otchłań płonie!',
  radius: 32,
  color: 0x6a1010,
  maxHp: 520,
  moveSpeed: 66,
  engageDistance: 58,
  openingDelayMs: 1400,
  restBetweenAttacksMs: 1200,
  pattern: [BossAttackKind.Cleave, BossAttackKind.Slam, BossAttackKind.Kindle],
  patternOrder: PatternOrder.Shuffled,
  shield: {
    arcDeg: 120,
    turnRateDegPerSec: 120,
    frontMeleeMultiplier: 0.5,
    reflectSpeed: 0.9,
    heat: { ticks: 6, radius: 96, telegraphMs: 600, damage: 16, knockback: 320 },
  },
  slam: { radius: 96, telegraphMs: 850, recoveryMs: 650, damage: 20, knockback: 340 },
  cleave: { reach: 42, radius: 46, telegraphMs: 600, recoveryMs: 750, damage: 22, knockback: 360 },
  hook: {
    minRange: 130,
    maxRange: 260,
    cooldownMs: 4500,
    telegraphMs: 650,
    recoveryMs: 500,
    step: 22,
    radius: 14,
    damage: 6,
    knockback: 0,
    followUp: { delayMs: 450, reach: 42, radius: 46, damage: 18, knockback: 340 },
  },
  kindle: { radius: 56, telegraphMs: 1000, recoveryMs: 500, damage: 16, knockback: 260 },
  arenaBraziers: 4,
  fireRing: { minRadius: 110, shrinkMs: 25000, damage: 8, knockback: 200 },
  enrage: {
    hpThreshold: 0.5,
    telegraphMultiplier: 0.8,
    restMultiplier: 0.65,
  },
} satisfies BossDefinition;

/**
 * Boss na konkretnych piętrach; pozostałe piętra mają Strażnika. Każdy biom kończy się swoim bossem:
 * 2 — Matka Pająków (Pajęcze leże), 3 — Król Pająków (Grzybnia), 4 — Grzybowy Pożeracz (Cmentarzysko).
 */
export const BOSS_BY_FLOOR: Readonly<Record<number, BossDefinition>> = {
  2: SPIDER_QUEEN,
  3: SPIDER_KING,
  4: FUNGAL_DEVOURER,
  5: GATE_WARDEN,
  6: ABYSS_EXECUTIONER,
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
    ...(boss.leap && { leap: dmg(boss.leap) }),
    ...(boss.lash && { lash: dmg(boss.lash) }),
    ...(boss.flurry && { flurry: dmg(boss.flurry) }),
    ...(boss.cocoonThrow && { cocoonThrow: dmg(boss.cocoonThrow) }),
    ...(boss.cleave && { cleave: dmg(boss.cleave) }),
    ...(boss.hook && { hook: { ...dmg(boss.hook)!, followUp: dmg(boss.hook.followUp)! } }),
    ...(boss.kindle && { kindle: dmg(boss.kindle) }),
    ...(boss.fireRing && { fireRing: dmg(boss.fireRing) }),
    ...(boss.shield?.heat && { shield: { ...boss.shield, heat: dmg(boss.shield.heat)! } }),
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
