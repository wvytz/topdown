import { TOWER_CONFIG } from '@/config/towerConfig';
import { floorInLoop } from '@/systems/TowerLoop';
import type { BossDefinition } from '@/core/bossTypes';
import type { BossDuetDefinition } from '@/systems/BossDuet';
import { BossAttackKind, BossId, PatternOrder } from '@/core/bossTypes';
import type { EnemyScalingConfig, StatusResistance } from '@/core/combatTypes';
import { EnemyType } from '@/core/combatTypes';
import { scaleForFloor } from '@/systems/CombatMath';
import { ITEM_EFFECTS } from '@/config/lootConfig';

/**
 * Odbicie pocisku od tarczy (krok 113, ocena właściciela: odbite podstawowe ataki zawsze wracały w strzelca):
 * odbity pocisk odchyla się losowo w lewo albo w prawo o 30–80° od kierunku „z powrotem”.
 */
const REFLECT_SPREAD = { minDeg: 30, maxDeg: 80 } as const;

/**
 * Świta bossów (krok 80, prośba właściciela: pomocnicy w walce). Wspólny rytm; boss wybiera archetyp
 * (wariant biomu dobiera gra) i może go podkręcić.
 */
const RETINUE_BASE = {
  firstAfterMs: 9000,
  everyMs: 16000,
  enragedEveryMs: 11000,
  count: 1,
  maxAlive: 2,
  telegraphMs: 1000,
  minPlayerDistanceTiles: 4,
} as const;

/**
 * Bezpieczne miejsce startu bossa (krok 131, uwaga testera: pająki i inni bossowie pojawiali się bohaterowi
 * na twarzy). Boss staje co najmniej tyle kafli od każdego bohatera i od wejść areny (we wspinaczce gracz wchodzi
 * przez nie), a bossowie duetu — od siebie. Przy wyjściu z windy (sprzątaczka, krok 126) bohater stojący przed
 * drzwiami zostaje odsunięty o `arrivalClearPx` poza ciało bossa.
 */
export const BOSS_SPAWN_SAFETY = {
  minPlayerDistanceTiles: 5,
  minEntranceDistanceTiles: 5,
  minBossGapTiles: 4,
  arrivalClearPx: 24,
} as const;

/**
 * Mocniejsza wściekłość (krok 81, wybór właściciela): ataki ze wzoru seriami po dwa (między nimi krótka luka)
 * i ryk przy wejściu we wściekłość — fala odrzuca gracza od bossa, lekko rani. Telegrafy zostają.
 */
const ENRAGE_FURY = {
  comboLength: 2,
  comboGapMs: 300,
  roar: { radius: 110, telegraphMs: 600, recoveryMs: 700, damage: 6, knockback: 420 },
} as const;

/** Pierwszy boss: „Strażnik Piętra”. Sekwencja: uderzenie → pierścień pocisków → ostrzał stref. */
export const FLOOR_GUARDIAN = {
  id: BossId.FloorGuardian,
  name: 'Strażnik Piętra',
  radius: 26,
  color: 0xb5452a,
  maxHp: 300,
  // Wzmocnienie bossów (prośba właściciela): szybszy chód, sprint z daleka (gracz ma 200) i czwarty cios — skok.
  moveSpeed: 65,
  sprint: { speed: 130, distance: 160 },
  engageDistance: 90,
  openingDelayMs: 1200,
  restBetweenAttacksMs: 1100,
  pattern: [BossAttackKind.Slam, BossAttackKind.Nova, BossAttackKind.Barrage, BossAttackKind.Leap],
  // Lekka losowość (krok 31, prośba właściciela): każdy atak raz na rundę, w losowej kolejności.
  patternOrder: PatternOrder.Shuffled,
  // Świta (krok 80): szkielet-Rusher ruin; pierwszy boss — najrzadsze wezwania.
  retinue: { ...RETINUE_BASE, type: EnemyType.Rusher, everyMs: 18000, enragedEveryMs: 13000 },
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
  // Skok na miejsce gracza: kto kituje z daleka, dostaje go na głowę; po lądowaniu okno na kontrę.
  leap: {
    telegraphMs: 750,
    flightMs: 450,
    radius: 56,
    damage: 16,
    knockback: 300,
    recoveryMs: 700,
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
    ...ENRAGE_FURY,
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
  // Wzmocnienie bossów (prośba właściciela): chód 70 → 80, sprint 150 → 165 (gracz 200, spowolniony siecią 100).
  moveSpeed: 80,
  sprint: { speed: 165, distance: 110 },
  // Ciała stykają się przy 40 px (28 + 12) — królowa staje tuż przy graczu.
  engageDistance: 44,
  openingDelayMs: 900,
  // Krok 26: trzy ataki w cyklu, krótsza przerwa (feedback właściciela: walka „banalnie łatwa”).
  restBetweenAttacksMs: 1600,
  // Krok 25: sieć za plecy gracza odcina ucieczkę; krok 26: wylęg z sufitu osacza, a skok karze stanie w miejscu.
  // Wzmocnienie bossów: czwarty cios — tupnięcie (Slam) karze stanie przy królowej.
  pattern: [BossAttackKind.Brood, BossAttackKind.Web, BossAttackKind.Leap, BossAttackKind.Slam],
  // Lekka losowość (krok 31, prośba właściciela): każdy atak raz na rundę, w losowej kolejności.
  patternOrder: PatternOrder.Shuffled,
  // Świta (krok 80): nietoperz (Kiter) — strzela, gdy gracz ucieka przed pajączkami.
  retinue: { ...RETINUE_BASE, type: EnemyType.Kiter },
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
  slam: {
    radius: 84,
    telegraphMs: 800,
    recoveryMs: 450,
    damage: 14,
    knockback: 280,
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
    ...ENRAGE_FURY,
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
  // Ciężki, ale nie ślamazarny (wzmocnienie bossów, prośba właściciela): z daleka dobiega sprintem,
  // z bliska podchodzi na odległość kos. Sprint wolniejszy od gracza (200).
  moveSpeed: 66,
  sprint: { speed: 120, distance: 130 },
  engageDistance: 52,
  openingDelayMs: 1200,
  restBetweenAttacksMs: 1500,
  // Wzmocnienie bossów: czwarty cios — tupnięcie (Slam) karze stanie przy Królu.
  pattern: [BossAttackKind.Bloom, BossAttackKind.Flurry, BossAttackKind.CocoonThrow, BossAttackKind.Slam],
  // Lekka losowość (krok 31, prośba właściciela): każdy atak raz na rundę, w losowej kolejności.
  patternOrder: PatternOrder.Shuffled,
  // Świta (krok 80): zarażony pająk (Rusher).
  retinue: { ...RETINUE_BASE, type: EnemyType.Rusher },
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
  // Tupnięcie: fala dookoła Króla, wolny czytelny zamach — trzeba odskoczyć poza zasięg.
  slam: {
    radius: 90,
    telegraphMs: 850,
    recoveryMs: 500,
    damage: 16,
    knockback: 300,
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
    ...ENRAGE_FURY,
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
 * zamach łapami (`cleave`, dawny tasak), zew spiżarni; od kroku 111 wyrzut zarodników i ślad grzybów za nim.
 */
export const FUNGAL_DEVOURER = {
  id: BossId.FungalDevourer,
  name: 'Grzybowy Pożeracz',
  title: 'Ucztujący w Kryptach',
  enragedLabel: 'Głód!',
  radius: 28,
  color: 0x6a1e24,
  maxHp: 460,
  // Krok 111 (ocena właściciela: „zero wyzwania, za wolny, nie trafia”): szybszy chód i sprint (gracz ma 200),
  // krótsze przerwy i telegrafy; skok, zamach i wyrzut celują tam, dokąd gracz biegnie (`lead`).
  moveSpeed: 88,
  sprint: { speed: 178, distance: 110 },
  engageDistance: 50,
  openingDelayMs: 900,
  restBetweenAttacksMs: 1050,
  pattern: [BossAttackKind.Cleave, BossAttackKind.Leap, BossAttackKind.SporeVolley, BossAttackKind.Call, BossAttackKind.Slam],
  patternOrder: PatternOrder.Shuffled,
  // Świta (krok 80): siewca (Kiter) — zarażonych z kokonów Pożeracz ma już ze spiżarni.
  retinue: { ...RETINUE_BASE, type: EnemyType.Kiter },
  // Kąsanie paszczą: szybkie, z bliska; trafienie leczy Pożeracza.
  lash: {
    triggerRange: 66,
    reach: 34,
    radius: 30,
    telegraphMs: 400,
    recoveryMs: 350,
    cooldownMs: 1000,
    damage: 12,
    knockback: 200,
    healOnHit: 12,
  },
  // Szarża z kłapnięciem: doskok tam, dokąd gracz biegnie; lądowanie zostawia płat grzybów.
  leap: {
    telegraphMs: 520,
    flightMs: 380,
    radius: 50,
    damage: 15,
    knockback: 280,
    recoveryMs: 450,
    lead: { ms: 420, maxPx: 90 },
    leavesPatch: true,
  },
  // Zamach łapami (do kroku 33 tasak): szeroki; krok 111 — drugi zamach krok dalej łapie cofającego się gracza.
  cleave: {
    reach: 42,
    radius: 46,
    telegraphMs: 680,
    recoveryMs: 500,
    damage: 22,
    knockback: 340,
    lead: { ms: 250, maxPx: 50 },
    followUp: { delayMs: 300, reach: 92, radius: 40 },
  },
  // Zgniecenie: Pożeracz wali łapami w ziemię — fala dookoła niego; karze stanie przy nim.
  slam: {
    radius: 92,
    telegraphMs: 720,
    recoveryMs: 450,
    damage: 18,
    knockback: 320,
  },
  // Wyrzut zarodników (krok 111): kara za trzymanie dystansu; każdy strąk zostawia płat grzybów.
  sporeVolley: {
    count: 3,
    radius: 34,
    flightMs: 520,
    intervalMs: 160,
    behindDistance: 64,
    fanDeg: 80,
    lead: { ms: 600, maxPx: 120 },
    telegraphMs: 520,
    recoveryMs: 400,
    damage: 12,
    knockback: 160,
  },
  // Ślad grzybów (krok 111, prośba właściciela): za Pożeraczem wyrastają trujące grzyby — odcinają drogi ucieczki.
  trail: {
    spacing: 30,
    offsetY: 14,
    maxPatches: 14,
    enragedMaxPatches: 20,
    enragedDurationMs: 9000,
    patch: {
      startRadius: 6,
      maxRadius: 18,
      spreadMs: 500,
      durationMs: 6500,
      poison: { tickDamage: 3, tickMs: 500, durationMs: 1200 },
      slow: { pct: 0.35, durationMs: 350 },
    },
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
    ...ENRAGE_FURY,
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
  // Krok 113 (ocena właściciela: tarczownik „broken”, za dużo życia): 420 → 340.
  maxHp: 340,
  // Wzmocnienie bossów (prośba właściciela): szybszy chód, sprint z daleka (gracz ma 200) i trzeci cios — skok.
  moveSpeed: 72,
  sprint: { speed: 140, distance: 150 },
  engageDistance: 56,
  openingDelayMs: 1200,
  restBetweenAttacksMs: 1300,
  pattern: [BossAttackKind.Cleave, BossAttackKind.Slam, BossAttackKind.Leap],
  // Krok 44 (pomysł właściciela): z trzech stron areny kultyści rzucają bombami zza krat; wychodzą po śmierci Strażnika.
  galleries: { sides: 3, depth: 2, enemy: EnemyType.Kiter },
  patternOrder: PatternOrder.Shuffled,
  // Świta (krok 80): Rusher z Piekła — strzelców ma już w galeriach.
  retinue: { ...RETINUE_BASE, type: EnemyType.Rusher },
  shield: {
    arcDeg: 120,
    // Krok 113 (ocena właściciela: za często się obraca, nie ma kiedy wyładować combo): obrót 110 → 70°/s,
    // a po każdym ataku stoi 1,2 s z opuszczoną tarczą.
    turnRateDegPerSec: 70,
    loweredAfterAttackMs: 1200,
    frontMeleeMultiplier: 0.5,
    reflectSpeed: 0.8,
    reflectSpread: REFLECT_SPREAD,
    // Krok 74 (feedback właściciela: walka to krążenie i szukanie luki): ciosy w tarczę ją zbijają, pęknięta
    // odsłania bossa na kilka sekund — da się go bić z przodu, a obejście go jest opcją, nie koniecznością.
    guard: { hp: 90, breakMs: 3500 },
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
  // Skok na miejsce gracza (mechanika skoku Pożeracza): kto kituje z dystansu, dostaje na głowę; po lądowaniu okno na kontrę.
  leap: {
    telegraphMs: 700,
    flightMs: 420,
    radius: 50,
    damage: 18,
    knockback: 320,
    recoveryMs: 700,
  },
  enrage: {
    ...ENRAGE_FURY,
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
  // Krok 113 (jak Strażnik Bram): 520 → 430.
  maxHp: 430,
  // Wzmocnienie bossów (prośba właściciela): szybszy chód, sprint z daleka (gracz ma 200) i czwarty cios — skok.
  moveSpeed: 76,
  sprint: { speed: 145, distance: 150 },
  engageDistance: 58,
  openingDelayMs: 1400,
  restBetweenAttacksMs: 1200,
  pattern: [BossAttackKind.Cleave, BossAttackKind.Slam, BossAttackKind.Kindle, BossAttackKind.Leap],
  patternOrder: PatternOrder.Shuffled,
  // Świta (krok 80): Rusher z Piekła, najczęściej ze wszystkich bossów.
  retinue: { ...RETINUE_BASE, type: EnemyType.Rusher, everyMs: 14000, enragedEveryMs: 9000 },
  shield: {
    arcDeg: 120,
    // Krok 113 (jak Strażnik Bram): obrót 120 → 80°/s, po ataku 1 s bez tarczy.
    turnRateDegPerSec: 80,
    loweredAfterAttackMs: 1000,
    frontMeleeMultiplier: 0.5,
    reflectSpeed: 0.9,
    reflectSpread: REFLECT_SPREAD,
    heat: { ticks: 6, radius: 96, telegraphMs: 600, damage: 16, knockback: 320 },
    // Krok 79 (jak Strażnik Bram w kroku 74): ciosy w tarczę ją zbijają, pęknięta odsłania Kata na kilka sekund.
    guard: { hp: 110, breakMs: 3500 },
  },
  slam: { radius: 96, telegraphMs: 850, recoveryMs: 650, damage: 20, knockback: 340 },
  cleave: { reach: 42, radius: 46, telegraphMs: 600, recoveryMs: 750, damage: 22, knockback: 360 },
  // Skok na miejsce gracza: gdy trzyma dystans, Kat dopada go bez haka; po lądowaniu okno na kontrę.
  leap: { telegraphMs: 700, flightMs: 420, radius: 54, damage: 20, knockback: 340, recoveryMs: 700 },
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
    ...ENRAGE_FURY,
    hpThreshold: 0.5,
    telegraphMultiplier: 0.8,
    restMultiplier: 0.65,
  },
} satisfies BossDefinition;

/**
 * „Baron Dymu” (krok 83, boss piętra 7 — prośba właściciela): gruby ziomek z wysokim czołem i wielkim brzuchem,
 * puszką napoju energetycznego w lewej ręce i fajką w prawej (druga w ustach, dym przy twarzy). U boku ma czarnego doga.
 * - smuga dymu z prawej fajki (atak „prawej ręki”): trafienie przywołuje doga z rogu widoku;
 * - uderzenie brzuchem dookoła i salwa puszek z lewej ręki (lądują w strefach wokół gracza);
 * - dog (`dog`) to osobny boss-pomocnik: własne HP, skok z rogu, pościg i kłapnięcia;
 * - wściekłość: Baron wypija puszkę i ryczy (odrzut), potem ataki idą seriami.
 * Liczby moje, do strojenia w teście właściciela.
 */
export const SMOKE_BARON = {
  id: BossId.SmokeBaron,
  name: 'Baron Dymu',
  title: 'Pan Puszki i Fajki',
  enragedLabel: 'Pełen energii!',
  radius: 34,
  color: 0x8a8a80,
  maxHp: 640,
  moveSpeed: 62,
  sprint: { speed: 130, distance: 170 },
  engageDistance: 70,
  openingDelayMs: 1300,
  restBetweenAttacksMs: 1250,
  pattern: [BossAttackKind.Smoke, BossAttackKind.Slam, BossAttackKind.Barrage],
  patternOrder: PatternOrder.Shuffled,
  // Świta (krok 80): Rusher biomu; dog już jest pomocnikiem, więc wezwania rzadsze niż u Kata.
  retinue: { ...RETINUE_BASE, type: EnemyType.Rusher, everyMs: 17000, enragedEveryMs: 12000 },
  smoke: {
    telegraphMs: 800,
    recoveryMs: 700,
    damage: 8,
    knockback: 120,
    length: 280,
    step: 22,
    startRadius: 14,
    endRadius: 34,
  },
  // Uderzenie brzuchem: strefa dookoła, ciężka.
  slam: { radius: 92, telegraphMs: 850, recoveryMs: 650, damage: 18, knockback: 330 },
  // Puszki z lewej ręki: lądują w strefach wokół gracza (pierwsza celuje w niego).
  barrage: {
    zoneCount: 4,
    zoneRadius: 38,
    spread: 110,
    intervalMs: 300,
    telegraphMs: 900,
    recoveryMs: 450,
    damage: 13,
    knockback: 180,
    thrown: { flightMs: 450 },
  },
  dog: {
    radius: 15,
    maxHp: 150,
    moveSpeed: 150,
    heelDistance: 54,
    guardRange: 90,
    lunge: { telegraphMs: 700, lockBeforeMs: 250, speed: 460, durationMs: 850, damage: 14, knockback: 300, recoveryMs: 900 },
    bite: { triggerRange: 36, reach: 24, radius: 24, telegraphMs: 380, recoveryMs: 700, damage: 9, knockback: 160 },
    summonCooldownMs: 9000,
    respawnMs: 15000,
  },
  enrage: {
    ...ENRAGE_FURY,
    hpThreshold: 0.5,
    telegraphMultiplier: 0.8,
    restMultiplier: 0.65,
  },
} satisfies BossDefinition;

/** Okrzyki sprzątaczek (krok 125, teksty z konceptu zaakceptowanego przez właściciela; łatwo je zmienić). */
const CLEANER_SHOUTS = {
  idle: ['Nie chodź po mokrym!', 'Uwaga, ślisko!', 'Dopiero co myłam!', 'Wycieraj buty!', 'Kto tu nabłocił?!'],
  attacks: {
    [BossAttackKind.Spill]: ['Nie chodź po mokrym!', 'Uwaga, ślisko!'],
    [BossAttackKind.Hook]: ['Do wiadra z tobą!'],
    [BossAttackKind.Cleave]: ['Zaraz cię wymiotę!'],
    [BossAttackKind.Roar]: ['Kto tu nabłocił?!'],
    [BossAttackKind.Tangle]: ['Stój, nie depcz!', 'Ani kroku dalej!'],
  },
  everyMs: { min: 5000, max: 9000 },
  minGapMs: 1800,
} as const;

/**
 * Blond sprzątaczka „Mokra Podłoga” (krok 125, pomysł właściciela `#sprzataczki`): boss piętra A Lustrzanej komnaty.
 * Młoda, szczupła, ciut wyższa od brunetki; polerując posadzkę stoi i sypie błyskami.
 * - chlust z wiadra: kałuże mydlin przed nią i za graczem — na mokrym bohater się ślizga (sunie, skręca z bezwładnością);
 * - wiadro na sznurze (poza wzorem, z dystansu): ściąga trafionego pod jej stopy, zaraz potem zamiata miotłą;
 * - cios miotłą przed sobą;
 * - krzyczy z napisami nad głową;
 * - przy 1/3 HP (pomysł właściciela) w północnym murze otwiera się winda i sprzątaczka ucieka na górne piętro.
 * Liczby moje, do strojenia w teście właściciela.
 */
export const CLEANER_BLONDE = {
  id: BossId.CleanerBlonde,
  name: 'Sprzątaczka',
  title: 'Mokra Podłoga',
  enragedLabel: 'Wściekła!',
  radius: 18,
  color: 0xe0c070,
  maxHp: 600,
  moveSpeed: 74,
  sprint: { speed: 150, distance: 170 },
  engageDistance: 54,
  openingDelayMs: 1200,
  restBetweenAttacksMs: 1150,
  pattern: [BossAttackKind.Spill, BossAttackKind.Cleave],
  patternOrder: PatternOrder.Shuffled,
  // Świta (krok 80): Rusher biomu — na razie śmieciarz z ruin, pasuje do sprzątania.
  retinue: { ...RETINUE_BASE, type: EnemyType.Rusher, everyMs: 18000, enragedEveryMs: 13000 },
  spill: {
    telegraphMs: 750,
    recoveryMs: 600,
    damage: 6,
    knockback: 140,
    splashRadius: 34,
    count: 2,
    behindDistance: 72,
    fanDeg: 70,
    puddle: { startRadius: 16, maxRadius: 44, spreadMs: 500, durationMs: 8000 },
    slip: { durationMs: 450, traction: 2.2 },
  },
  // Cios miotłą: krótki zamach przed sobą.
  cleave: { reach: 30, radius: 36, telegraphMs: 600, recoveryMs: 650, damage: 16, knockback: 260 },
  // Wiadro na sznurze: z dystansu ściąga pod stopy, potem zamach miotłą dookoła przed sobą.
  hook: {
    look: 'bucket',
    minRange: 110,
    maxRange: 240,
    cooldownMs: 5000,
    telegraphMs: 650,
    recoveryMs: 500,
    step: 22,
    radius: 14,
    damage: 5,
    knockback: 0,
    followUp: { delayMs: 450, reach: 26, radius: 42, damage: 14, knockback: 300 },
  },
  // `arrive` — wyjście z windy w walce z brunetką (krok 126).
  shouts: { ...CLEANER_SHOUTS, escape: 'Sprzątaj sobie sam!', arrive: 'Znowu ty?!' },
  escape: { hpRatio: 1 / 3, speedMultiplier: 2.2, boardMs: 700, closeMs: 600 },
  enrage: {
    ...ENRAGE_FURY,
    // Wściekłość przed ucieczką (przy 1/3 HP): krótszy telegraf i serie w ostatniej części walki.
    hpThreshold: 0.6,
    telegraphMultiplier: 0.8,
    restMultiplier: 0.65,
  },
} satisfies BossDefinition;

/**
 * Czarnowłosa sprzątaczka „Twarda Miotła” (krok 126, `#sprzataczki`): boss piętra B Lustrzanej komnaty, na tym samym
 * modelu co blondynka (ciut niższa). Miotła zamiast wiadra:
 * - cios miotłą — szerszy i mocniejszy niż u blondynki;
 * - plątanie: wbija miotłę w posadzkę, pod graczem wyrasta czarne włosie i unieruchamia go (ataki wolno, ruch
 *   i dash nie); po uwolnieniu chwila odporności; we wściekłości dwie strefy — druga tam, dokąd bohater biegnie;
 * - chlust jak u blondynki, ale jedna kałuża (mniej poślizgu, więcej plątania);
 * - w połowie jej HP z windy wraca blondynka z 1/3 HP (duet `BOSS_DUETS`, decyzja w wątku właściciela).
 * Liczby moje, do strojenia w teście właściciela.
 */
export const CLEANER_DARK = {
  id: BossId.CleanerDark,
  name: 'Sprzątaczka',
  title: 'Twarda Miotła',
  enragedLabel: 'Wściekła!',
  radius: 17,
  color: 0x403848,
  maxHp: 700,
  moveSpeed: 78,
  sprint: { speed: 155, distance: 170 },
  engageDistance: 50,
  openingDelayMs: 1200,
  restBetweenAttacksMs: 1100,
  pattern: [BossAttackKind.Cleave, BossAttackKind.Tangle, BossAttackKind.Spill],
  patternOrder: PatternOrder.Shuffled,
  retinue: { ...RETINUE_BASE, type: EnemyType.Rusher, everyMs: 18000, enragedEveryMs: 13000 },
  cleave: { reach: 34, radius: 42, telegraphMs: 620, recoveryMs: 600, damage: 19, knockback: 300 },
  tangle: {
    telegraphMs: 800,
    recoveryMs: 700,
    damage: 4,
    knockback: 0,
    radius: 26,
    root: { durationMs: 1100, immunityMs: 2200 },
    lead: { ms: 500, maxPx: 100 },
  },
  spill: { ...CLEANER_BLONDE.spill, count: 1 },
  shouts: CLEANER_SHOUTS,
  enrage: {
    ...ENRAGE_FURY,
    hpThreshold: 0.5,
    telegraphMultiplier: 0.8,
    restMultiplier: 0.65,
  },
} satisfies BossDefinition;

/**
 * Boss na konkretnych piętrach; pozostałe piętra mają Strażnika. Każdy biom kończy się swoim bossem.
 * Od kroku 127 (koncept sprzątaczek zaakceptowany przez właściciela): 2 — Król Pająków z Matką Pająków (duet
 * w Grzybni, `BOSS_DUETS`), 3 — Grzybowy Pożeracz (Cmentarzysko), 4 — Piekło, 5 — Baron Dymu,
 * 6–7 — sprzątaczki (Lustrzana komnata). Krok 134 (decyzja właściciela: „scalamy tarczowników, jeden wystarczy”):
 * Piekło ma jedno piętro i jednego bossa z tarczą — Kata Otchłani; Strażnik Bram zostaje w kodzie poza wspinaczką.
 */
export const BOSS_BY_FLOOR: Readonly<Record<number, BossDefinition>> = {
  2: SPIDER_KING,
  3: FUNGAL_DEVOURER,
  4: ABYSS_EXECUTIONER,
  5: SMOKE_BARON,
  6: CLEANER_BLONDE,
  7: CLEANER_DARK,
};

/** Wszyscy bossowie gry — partner duetu nie musi mieć własnego piętra (Matka Pająków od kroku 127, Strażnik Bram poza wspinaczką od kroku 134). */
const ALL_BOSSES: readonly BossDefinition[] = [
  FLOOR_GUARDIAN,
  SPIDER_QUEEN,
  SPIDER_KING,
  FUNGAL_DEVOURER,
  GATE_WARDEN,
  ABYSS_EXECUTIONER,
  SMOKE_BARON,
  CLEANER_BLONDE,
  CLEANER_DARK,
];

/** Definicja bossa po identyfikatorze (partner duetu). */
export function bossById(id: BossId): BossDefinition {
  const boss = ALL_BOSSES.find((b) => b.id === id);
  if (!boss) throw new Error(`bossById: nieznany boss ${id}`);
  return boss;
}

/** Boss piętra; po ostatnim piętrze kręgu kolejny krąg wieży powtarza bossów od nowa (krok 43). */
export function bossForFloor(floor: number): BossDefinition {
  return BOSS_BY_FLOOR[floorInLoop(floor, TOWER_CONFIG)] ?? FLOOR_GUARDIAN;
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
    ...(boss.smoke && { smoke: dmg(boss.smoke) }),
    ...(boss.sporeVolley && { sporeVolley: dmg(boss.sporeVolley) }),
    ...(boss.spill && { spill: dmg(boss.spill) }),
    ...(boss.tangle && { tangle: dmg(boss.tangle) }),
    ...(boss.dog && {
      dog: {
        ...boss.dog,
        maxHp: scaleForFloor(boss.dog.maxHp, floor, scaling.hpPerFloor),
        lunge: dmg(boss.dog.lunge)!,
        bite: dmg(boss.dog.bite)!,
      },
    }),
    ...(boss.fireRing && { fireRing: dmg(boss.fireRing) }),
    ...(boss.shield?.heat && { shield: { ...boss.shield, heat: dmg(boss.shield.heat)! } }),
    ...(boss.spiderling && { spiderling: dmg(boss.spiderling) }),
    ...(boss.enrage.roar && { enrage: { ...boss.enrage, roar: dmg(boss.enrage.roar)! } }),
  };
}

/**
 * Boss znosi efekty gorzej niż zwykli wrogowie: ogłuszenie trwa 40% czasu, a potem
 * przez 3 s jest na nie odporny (serią strzał nie da się go zablokować). Spowolnienie ma połowę siły.
 * Krok 93: podpalenie też ma połowę siły — boss nie topnieje od samego ognia.
 */
export const BOSS_STATUS_RESISTANCE: StatusResistance = {
  stunMultiplier: 0.4,
  stunImmunityMs: 3000,
  slowMultiplier: 0.5,
  burnMultiplier: 0.5,
};

/**
 * Duety bossów — we wspinaczce i w arenach bossów tak samo.
 * - Pajęczy duet (krok 114, pomysł właściciela; od kroku 127 także we wspinaczce): w Grzybni Król Pająków
 *   i Matka Pająków walczą naraz, każde z pełnym HP. Zwolnione piętro dostała Lustrzana komnata.
 * - Sprzątaczki (krok 126, `#sprzataczki`): na piętrze brunetki w połowie jej HP z windy w północnym murze wraca
 *   blondynka, która uciekła piętro niżej — z 1/3 HP (tyle, z ilu uciekła).
 */
export const BOSS_DUETS: readonly BossDuetDefinition[] = [
  {
    floorInLoop: 2,
    partner: BossId.SpiderQueen,
    spawnOffsetTiles: 2.5,
    bodyGapPx: 4,
    hpMultiplier: 1,
    // Dwie świty naraz to za dużo tłoku na arenie — przywołuje tylko Król (zarażone pająki).
    partnerRetinue: false,
    name: 'Matka i Król Pająków',
    title: 'Pajęczy duet',
  },
  {
    floorInLoop: 7,
    partner: BossId.CleanerBlonde,
    spawnOffsetTiles: 0,
    bodyGapPx: 4,
    hpMultiplier: 1,
    // Blondynka wpada sama — świtę przywołuje tylko brunetka.
    partnerRetinue: false,
    name: 'Sprzątaczki',
    title: 'Wielkie sprzątanie',
    arrival: { hostHpRatio: 0.5, partnerHpRatio: 1 / 3, enterMs: 700 },
  },
];
