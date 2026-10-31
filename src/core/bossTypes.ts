/** Typy domenowe bossa — czyste dane, bez zależności od Phasera. */
import type { EnemyType, ParalysisEffect, PoisonEffect, SlipEffect, StatusApplication } from '@/core/combatTypes';
import type { IntRange } from '@/core/dungeonTypes';
import type { Vector2 } from '@/core/types';

export enum BossAttackKind {
  /** Uderzenie obszarowe wokół bossa. */
  Slam = 'slam',
  /** Pierścień pocisków we wszystkich kierunkach. */
  Nova = 'nova',
  /** Seria stref uderzeń wokół pozycji gracza, wybuchających po kolei. */
  Barrage = 'barrage',
  /** Wylęg (Matka Pająków): boss składa za sobą pajączki-kamikaze. */
  Brood = 'brood',
  /** Rzut siecią (Matka Pająków, krok 25): lepka sieć ląduje za plecami gracza i się rozrasta. */
  Web = 'web',
  /** Królewski skok (Matka Pająków, krok 26): przysiad, skok łukiem na miejsce gracza, fala przy lądowaniu. */
  Leap = 'leap',
  /** Smagnięcie nogami (Matka Pająków, krok 27): cios wręcz z bliska, zatruwa gracza. U Króla: ścięcie kosami. */
  Lash = 'lash',
  /** Grad sztyletów (Król Pająków, krok 29): seria ukłuć w linii w stronę gracza. */
  Flurry = 'flurry',
  /** Rzut kokonem (Król Pająków, krok 29): kokon ląduje na graczu i paraliżuje. */
  CocoonThrow = 'cocoon-throw',
  /** Wysyp grzybni (Król Pająków, krok 29): wokół gracza wyrastają trujące płaty grzybni (teren). */
  Bloom = 'bloom',
  /** Ciężki cios przed sobą (krok 33 tasak Lorda, od kroku 34 zamach łapami Grzybowego Pożeracza). */
  Cleave = 'cleave',
  /** Zew spiżarni (Grzybowy Pożeracz): kokony drżą, z wybranych wychodzą zarażeni. */
  Call = 'call',
  /** Uczta (Grzybowy Pożeracz): boss pożera kokon ze spiżarni — leczy się i rośnie w siłę. Poza wzorem. */
  Feast = 'feast',
  /** Hak na łańcuchu (Kat Otchłani, krok 41f): z dystansu przyciąga gracza pod tarczę. Poza wzorem. */
  Hook = 'hook',
  /** Oddech palenisk (Kat Otchłani): wszystkie paleniska areny buchają naraz. */
  Kindle = 'kindle',
  /** Ryk wściekłości (krok 81): raz, przy wejściu we wściekłość — fala odrzuca gracza od bossa. Poza wzorem. */
  Roar = 'roar',
  /** Smuga dymu (Baron Dymu, krok 83): z fajki w prawej ręce; trafienie przywołuje doga z rogu ekranu. */
  Smoke = 'smoke',
  /** Wyrzut zarodników (Grzybowy Pożeracz, krok 111): strąki lecą łukiem tam, dokąd biegnie gracz, i zostawiają grzyby. */
  SporeVolley = 'spore-volley',
  /** Chlust z wiadra (sprzątaczki, krok 125): woda rozlewa się przed bossem w kałuże, na których bohater się ślizga. */
  Spill = 'spill',
  /** Plątanie (brunetka, krok 126): pod bohaterem wyrasta czarne włosie miotły — kto stoi w strefie, nie może chodzić. */
  Tangle = 'tangle',
  /** Klucz bocianów (Brudna Wiedźma, krok 137): cienie ptaków w pasach przez arenę, potem bociany przelatują jak włócznie. */
  StorkFlight = 'stork-flight',
  /** Pikowanie (Brudna Wiedźma): ptaszek znaczy miejsca wokół bohatera, potem w każde pikuje ptak. */
  BirdDive = 'bird-dive',
  /** Kwiat-oko (Brudna Wiedźma): rzucone nasiona wyrastają w czerwone kwiaty, które pulsują pierścieniami pyłku. */
  FlowerEye = 'flower-eye',
  /** Wir sukni (Brudna Wiedźma): obrót wokół siebie — fala przy niej i pierścień liści. */
  Whirl = 'whirl',
}

/** Który boss — wybiera wygląd (spriteConfig) i ślady po walce. */
export enum BossId {
  FloorGuardian = 'floor-guardian',
  SpiderQueen = 'spider-queen',
  SpiderKing = 'spider-king',
  FungalDevourer = 'fungal-devourer',
  /** Piekło (krok 41e; od kroku 134 poza wspinaczką — jeden boss z tarczą wystarczy): Strażnik Bram — tarcza z przodu, wirujący łańcuch. */
  GateWarden = 'gate-warden',
  /** Piekło (krok 41f; od kroku 134 piętro 4, jedyne Piekła): Kat Otchłani — tarcza, hak, oddech palenisk, pierścień ognia. */
  AbyssExecutioner = 'abyss-executioner',
  /** Palarnia (krok 83; od kroku 134 piętro 5): Baron Dymu — gruby z puszką i fajką, smuga dymu, czarny dog u boku. */
  SmokeBaron = 'smoke-baron',
  /** Lustrzana komnata, piętro A (krok 125): blond sprzątaczka — chlust i wiadro; przy 1/3 HP ucieka windą. */
  CleanerBlonde = 'cleaner-blonde',
  /** Lustrzana komnata, piętro B (krok 126): brunetka — miotła, plątanie i chlust; w połowie walki wraca blondynka. */
  CleanerDark = 'cleaner-dark',
  /** Bociani Ogród (krok 137, szkic właściciela `#brudna-wiedzma`): Brudna Wiedźma — bociany, ptaki, kwiaty-oczy i żuki. */
  DirtyWitch = 'dirty-witch',
}

/** Kolejność ataków ze wzoru (krok 31). */
export enum PatternOrder {
  /** Zawsze po kolei, w kółko. */
  Fixed = 'fixed',
  /**
   * „Worek”: w każdej rundzie każdy atak raz, w losowej kolejności; ten sam atak nigdy dwa razy z rzędu
   * (także na styku rund), a pierwszy atak walki to zawsze pierwszy ze wzoru — podpis bossa.
   */
  Shuffled = 'shuffled',
}

export enum BossPhase {
  /** Czeka, aż gracz wejdzie na arenę. */
  Dormant = 'dormant',
  Fighting = 'fighting',
}

/**
 * Wyprzedzenie celu (krok 111, „Pożeracz nie trafia”): boss celuje tam, gdzie gracz będzie za `ms`
 * (prędkość gracza z ostatnich klatek), najwyżej `maxPx` od jego obecnego miejsca.
 */
export interface AimLead {
  readonly ms: number;
  readonly maxPx: number;
}

/**
 * Płat grzybów na ziemi (krok 111, Grzybowy Pożeracz): rośnie od `startRadius` do `maxRadius` przez `spreadMs`
 * i leży `durationMs`. Bohater, którego ślad stóp dotyka płatu, jest zatruty i spowolniony (teren — chroni dash).
 */
export interface FungalPatchDefinition {
  readonly startRadius: number;
  readonly maxRadius: number;
  readonly spreadMs: number;
  readonly durationMs: number;
  readonly poison: PoisonEffect;
  readonly slow: { readonly pct: number; readonly durationMs: number };
}

/**
 * Ślad grzybów (krok 111, prośba właściciela): co `spacing` px drogi bossa na ziemi pod nim (środek + `offsetY`)
 * wyrasta płat grzybów. Najwyżej `maxPatches` płatów naraz (najstarszy znika). We wściekłości płaty leżą
 * `enragedDurationMs` i jest ich najwyżej `enragedMaxPatches`.
 */
export interface FungalTrailDefinition {
  readonly spacing: number;
  readonly offsetY: number;
  readonly maxPatches: number;
  readonly enragedMaxPatches: number;
  readonly enragedDurationMs: number;
  readonly patch: FungalPatchDefinition;
}

/**
 * Wyrzut zarodników (krok 111): po telegrafie strąki lecą łukiem — pierwszy w miejsce, do którego biegnie gracz
 * (`lead`), kolejne w wachlarzu dalej za nim (`behindDistance`, `fanDeg`). Lądowanie rani w strefie `radius`
 * i zostawia płat grzybów ze śladu. Po wściekłości jeden strąk więcej.
 */
export interface SporeVolleyDefinition extends BaseBossAttackDefinition {
  readonly count: number;
  readonly radius: number;
  readonly flightMs: number;
  readonly intervalMs: number;
  readonly behindDistance: number;
  readonly fanDeg: number;
  readonly lead: AimLead;
}

interface BaseBossAttackDefinition {
  /** Czas telegrafu przed pierwszym uderzeniem — gracz widzi strefę i może uciec. */
  readonly telegraphMs: number;
  /** Pauza po ostatnim uderzeniu, zanim boss znów się ruszy. */
  readonly recoveryMs: number;
  readonly damage: number;
  readonly knockback: number;
}

export interface SlamAttackDefinition extends BaseBossAttackDefinition {
  readonly radius: number;
}

export interface NovaAttackDefinition extends BaseBossAttackDefinition {
  readonly projectileCount: number;
  readonly projectileSpeed: number;
  readonly projectileLifetimeMs: number;
  /** Liczba fal; po wściekłości dochodzi jedna więcej. */
  readonly waves: number;
  readonly waveIntervalMs: number;
}

export interface BarrageAttackDefinition extends BaseBossAttackDefinition {
  readonly zoneCount: number;
  readonly zoneRadius: number;
  /** Maksymalne odsunięcie stref (poza pierwszą) od pozycji gracza. */
  readonly spread: number;
  /** Odstęp między wybuchami kolejnych stref. */
  readonly intervalMs: number;
  /**
   * Strefy to rzucane przedmioty lecące łukiem od bossa przez `flightMs` przed uderzeniem: puszki Barona Dymu
   * (domyślnie) albo flegma Króla Szlamu (`look: 'phlegm'`, krok 153).
   */
  readonly thrown?: { readonly flightMs: number; readonly look?: ThrownObject['look'] };
  /** Pierwsza strefa tam, dokąd biegnie gracz (krok 153: kara za bieganie w kółko); brak = na gracza. */
  readonly lead?: AimLead;
}

/**
 * Wylęg z sufitu (krok 26): boss wydaje zew, potem pajączki spadają po kolei pierścieniem wokół gracza.
 * Każdy cień pojawia się wokół AKTUALNEJ pozycji gracza (pierścień „goni” uciekającego).
 */
export interface BroodAttackDefinition {
  /** Ile pajączków na jeden wylęg (po wściekłości jeden więcej). */
  readonly count: number;
  /** Limit żywych pajączków — wylęg dokłada tylko do limitu. */
  readonly maxAlive: number;
  /** Czas zewu (animacja złożenia): pierwszy cień pojawia się na jego końcu. */
  readonly birthMs: number;
  /** Odległość miejsc lądowania od gracza (px). */
  readonly ringRadius: number;
  /** Losowe odchylenie każdego miejsca od równego podziału pierścienia (stopnie, ±). */
  readonly ringJitterDeg: number;
  /** Odstęp między kolejnymi zrzutami. */
  readonly dropIntervalMs: number;
  /** Czas rosnącego cienia do lądowania pajączka. */
  readonly fallMs: number;
  readonly recoveryMs: number;
}

/** Królewski skok: przysiad (telegraf strefy lądowania), lot łukiem, fala uderzeniowa przy lądowaniu. */
export interface LeapAttackDefinition extends BaseBossAttackDefinition {
  readonly flightMs: number;
  /** Promień fali przy lądowaniu (strefa obrażeń). */
  readonly radius: number;
  /** Skok tam, dokąd biegnie gracz (krok 111); brak = na jego miejsce z chwili planu. */
  readonly lead?: AimLead;
  /** Lądowanie zostawia płat grzybów ze śladu (Grzybowy Pożeracz, krok 111). */
  readonly leavesPatch?: boolean;
}

/**
 * Rzut siecią: boss celuje za plecy gracza (dalej od siebie, w stronę ucieczki), kłąb sieci leci
 * łukiem i po wylądowaniu rozrasta się w lepką plamę spowalniającą gracza (jak pajęczyny leża).
 */
export interface WebAttackDefinition {
  /** Zamach przed rzutem — miejsce lądowania jest już oznaczone. */
  readonly telegraphMs: number;
  readonly flightMs: number;
  /** Odległość miejsca lądowania za graczem (px, na linii boss → gracz). */
  readonly behindDistance: number;
  /** Ile sieci w rzucie (po wściekłości jedna więcej) … */
  readonly count: number;
  /** … rozstawionych w wachlarzu za graczem (stopnie, cały wachlarz). */
  readonly fanDeg: number;
  /** Promień plamy tuż po wylądowaniu i po rozroście (px). */
  readonly startRadius: number;
  readonly maxRadius: number;
  readonly spreadMs: number;
  /** Jak długo plama leży od wylądowania. */
  readonly durationMs: number;
  /** Spowolnienie odnawiane co klatkę w plamie (`durationMs` = klejenie po wyjściu). */
  readonly slow: { readonly pct: number; readonly durationMs: number };
  readonly recoveryMs: number;
}

/**
 * Smagnięcie nogami: atak poza wzorem — boss uderza, gdy gracz jest bliżej niż `triggerRange`
 * i minął `cooldownMs`. Strefa przed bossem (środek `reach` px w stronę gracza, promień `radius`).
 */
export interface LashAttackDefinition extends BaseBossAttackDefinition {
  readonly triggerRange: number;
  readonly reach: number;
  readonly radius: number;
  readonly cooldownMs: number;
  /** Status trafienia: trucizna (Matka Pająków), paraliż (ścięcie Króla); brak = sam cios. */
  readonly status?: StatusApplication;
  /** Trafienie leczy bossa o tyle HP (kąsanie Grzybowego Pożeracza, krok 33). */
  readonly healOnHit?: number;
}

/** Cios tasakiem: strefa `radius` przed bossem (środek `reach` px w stronę gracza), wolny i ciężki. */
export interface CleaveAttackDefinition extends BaseBossAttackDefinition {
  readonly reach: number;
  readonly radius: number;
  /** Kierunek zamachu z wyprzedzeniem ruchu gracza (krok 111). */
  readonly lead?: AimLead;
  /**
   * Drugi zamach (krok 111, Pożeracz): `delayMs` po pierwszym, strefa `reach` dalej w tym samym kierunku —
   * kto cofnął się tylko o krok, dostaje drugim.
   */
  readonly followUp?: { readonly delayMs: number; readonly reach: number; readonly radius: number };
}

/** Zew spiżarni: po telegrafie (kokony drżą) `count` kokonów pęka i wypuszcza zarażonych (wściekłość: +1). */
export interface CallAttackDefinition {
  readonly telegraphMs: number;
  readonly count: number;
  readonly recoveryMs: number;
}

/**
 * Spiżarnia i uczta (krok 33): kokony z zarażonymi przy ścianach areny. Co `cooldownMs` boss idzie do
 * najbliższego kokonu i przez `durationMs` go pożera (okno na kontrę): leczy się o `heal` i dostaje stos
 * wzmocnienia (obrażenia, chód; najwyżej `maxStacks`). Kokon zniszczony przez gracza wypuszcza zarażonego.
 */
export interface FeastDefinition {
  readonly larders: { readonly count: IntRange; readonly wallMarginTiles: number; readonly minSpacingTiles: number; readonly centerClearTiles: number };
  /** Promień kokonu (px): trafienia gracza. */
  readonly larderRadius: number;
  readonly firstAfterMs: number;
  readonly cooldownMs: number;
  /** Odstęp uczt po wściekłości („Głód!”). */
  readonly enragedCooldownMs: number;
  /** Boss zaczyna ucztę, gdy stoi tak blisko kokonu (px). */
  readonly reach: number;
  readonly durationMs: number;
  readonly heal: number;
  readonly damagePerStack: number;
  readonly speedPerStack: number;
  readonly maxStacks: number;
}

/** Uczta w planie: pożerany kokon (pozycja z chwili planu) i chwila, w której znika w paszczy. */
export interface FeastBite {
  readonly target: Vector2;
  readonly at: number;
}

/** Zew w planie: ile kokonów pęka i kiedy. */
export interface LarderRelease {
  readonly count: number;
  readonly telegraphStartAt: number;
  readonly at: number;
}

/** Grad sztyletów: `count` ukłuć w linii boss → gracz, od `startDistance` co `step` px, jedno po drugim. */
export interface FlurryAttackDefinition extends BaseBossAttackDefinition {
  readonly count: number;
  readonly startDistance: number;
  readonly step: number;
  readonly radius: number;
  readonly intervalMs: number;
}

/** Rzut kokonem: kokon leci łukiem na miejsce gracza; przy lądowaniu strefa obrażeń z paraliżem. */
export interface CocoonThrowDefinition extends BaseBossAttackDefinition {
  readonly flightMs: number;
  readonly radius: number;
  readonly paralysis: ParalysisEffect;
  /** Ile kokonów (po wściekłości jeden więcej — dodatkowe lądują za graczem, w drodze ucieczki). */
  readonly count: number;
  /** Odległość dodatkowych kokonów za graczem (px, na linii boss → gracz, w wachlarzu). */
  readonly behindDistance: number;
}

/**
 * Wysyp grzybni: płaty wyrastają wokół gracza (pierwszy pod nim) po telegrafie, rosną i leżą długo.
 * W płacie: trucizna i spowolnienie odnawiane co klatkę (teren — chroni tylko dash).
 */
export interface BloomAttackDefinition {
  readonly telegraphMs: number;
  readonly count: number;
  readonly ring: { readonly min: number; readonly max: number };
  readonly startRadius: number;
  readonly maxRadius: number;
  readonly spreadMs: number;
  readonly durationMs: number;
  readonly poison: PoisonEffect;
  readonly slow: { readonly pct: number; readonly durationMs: number };
  readonly recoveryMs: number;
}

/** Pajączek-kamikaze: biegnie do gracza, po zapłonie wybucha. Ginie od jednego trafienia. */
export interface SpiderlingDefinition {
  readonly radius: number;
  readonly maxHp: number;
  readonly moveSpeed: number;
  /** Zapłon zaczyna się, gdy pajączek jest tak blisko gracza … */
  readonly primeRange: number;
  /** … albo gdy od wylęgu minie tyle czasu (wybucha „po chwili”, nawet jeśli nie dobiegł). */
  readonly fuseMs: number;
  /** Czas zapłonu (telegraf): pajączek stoi, potem wybucha. */
  readonly primeMs: number;
  readonly blastRadius: number;
  readonly damage: number;
  readonly knockback: number;
  /** Wygląd: pajączek (domyślnie) albo żuk z roju Brudnej Wiedźmy (krok 137). */
  readonly look?: 'beetle';
}

/**
 * Tarcza bossa (krok 41e): chroni stożek przed bossem — pociski z przodu odbija, promień z przodu nie rani,
 * cios w tarczę zadaje część obrażeń. Boss obraca ją do gracza z ograniczoną prędkością, a w ataku wcale.
 */
export interface ShieldDefinition {
  /** Szerokość chronionego stożka (stopnie, całość). */
  readonly arcDeg: number;
  /**
   * Rozgrzanie (Kat, krok 41f): tyle ticków promienia w tarczę i boss odpowiada wybuchem żaru wokół siebie.
   * Brak = promień w tarczę po prostu nie rani.
   */
  readonly heat?: { readonly ticks: number; readonly radius: number; readonly telegraphMs: number; readonly damage: number; readonly knockback: number };
  /** Prędkość obrotu tarczy do gracza (stopnie na sekundę). */
  readonly turnRateDegPerSec: number;
  /** Po końcu każdego ataku boss stoi z opuszczoną tarczą przez tyle ms — okno na pełne combo (krok 113). */
  readonly loweredAfterAttackMs: number;
  /** Cios wręcz (i dash) w tarczę zadaje tyle obrażeń (0–1). */
  readonly frontMeleeMultiplier: number;
  /** Odbity pocisk leci z prędkością pocisku ×tyle i zadaje tyle obrażeń co oryginał. */
  readonly reflectSpeed: number;
  /** Odbity pocisk leci z odchyleniem z tego zakresu (stopnie) w losową stronę, nie prosto w strzelca (krok 113). */
  readonly reflectSpread: { readonly minDeg: number; readonly maxDeg: number };
  /**
   * Wytrzymałość tarczy (krok 74, Strażnik Bram): ciosy wręcz w tarczę z przodu zbijają ją (pełnymi obrażeniami),
   * a gdy spadnie do zera, tarcza pęka na `breakMs` — boss przyjmuje wtedy pełne obrażenia z każdej strony,
   * potem tarcza wraca z pełną wytrzymałością. Brak = tarcza niezniszczalna (Kat Otchłani).
   */
  readonly guard?: { readonly hp: number; readonly breakMs: number };
}

/**
 * Hak na łańcuchu (Kat Otchłani, krok 41f): poza wzorem, gdy gracz stoi dalej niż `minRange` (do `maxRange`)
 * i minął `cooldownMs`. Telegraf: linia stref od bossa w stronę gracza; trafienie przyciąga gracza pod tarczę,
 * a po `followUp.delayMs` boss uderza tarczą przed sobą. Dash w bok = unik.
 */
export interface HookAttackDefinition extends BaseBossAttackDefinition {
  readonly minRange: number;
  readonly maxRange: number;
  readonly cooldownMs: number;
  /** Strefy wzdłuż łańcucha: co `step` px, promień `radius`. */
  readonly step: number;
  readonly radius: number;
  readonly followUp: { readonly delayMs: number; readonly reach: number; readonly radius: number; readonly damage: number; readonly knockback: number };
  /** Wiadro na sznurze zamiast łańcucha z hakiem (sprzątaczka, krok 125): leci wiadro, napis „Do wiadra z tobą!”. */
  readonly look?: 'bucket';
}

/** Oddech palenisk: po telegrafie wszystkie paleniska areny buchają naraz (strefa `radius` wokół każdego). */
export interface KindleAttackDefinition extends BaseBossAttackDefinition {
  readonly radius: number;
}

/**
 * Pierścień ognia (Kat, po wściekłości): brzeg areny płonie, a wolne koło w środku kurczy się
 * od połowy krótszego boku areny do `minRadius` przez `shrinkMs`. Poza kołem ogień parzy (przez trafienie
 * z nietykalnością) i odpycha do środka.
 */
export interface FireRingDefinition {
  readonly minRadius: number;
  readonly shrinkMs: number;
  readonly damage: number;
  readonly knockback: number;
}

/**
 * Smuga dymu (Baron Dymu): z prawej fajki wylatuje długa smuga w stronę gracza — ciąg stref od bossa,
 * które uderzają jednocześnie po telegrafie (uciec w bok albo dashem). Trafienie przywołuje doga
 * (`BossDogDefinition`), jeśli jest gotowy do skoku.
 */
export interface SmokeAttackDefinition extends BaseBossAttackDefinition {
  /** Zasięg smugi (px od środka bossa). */
  readonly length: number;
  /** Strefy wzdłuż smugi: co `step` px, rosnący promień od `startRadius` do `endRadius` (smuga rozchodzi się). */
  readonly step: number;
  readonly startRadius: number;
  readonly endRadius: number;
}

/**
 * Dog Barona (krok 83): osobny boss-pomocnik. U boku Barona warczy i pilnuje go (ugryzie, gdy gracz podejdzie).
 * Trafienie smugą dymu: dog znika z boku Barona i wypada z rogu widoku — krótki telegraf (kierunek skoku
 * blokuje się tuż przed wybiciem, da się go ominąć), szarża, a po niej okno na kontrę. Potem goni i gryzie.
 * Zabity wraca po `respawnMs` (kolejna smuga go przywoła nie wcześniej).
 */
export interface BossDogDefinition {
  readonly radius: number;
  readonly maxHp: number;
  readonly moveSpeed: number;
  /** Pilnuje Barona: trzyma się tak blisko boku (px), a gracza w tej odległości od siebie atakuje. */
  readonly heelDistance: number;
  readonly guardRange: number;
  /** Skok z rogu widoku. */
  readonly lunge: {
    readonly telegraphMs: number;
    /** Kierunek skoku blokuje się tyle przed wybiciem (krótsza zapowiedź = trudniej uniknąć). */
    readonly lockBeforeMs: number;
    readonly speed: number;
    readonly durationMs: number;
    readonly damage: number;
    readonly knockback: number;
    readonly recoveryMs: number;
  };
  /** Kłapnięcie z bliska: strefa `radius` przed psem (środek `reach` px), po telegrafie. */
  readonly bite: {
    readonly triggerRange: number;
    readonly reach: number;
    readonly radius: number;
    readonly telegraphMs: number;
    readonly recoveryMs: number;
    readonly damage: number;
    readonly knockback: number;
  };
  /** Najwcześniej tyle po ostatnim skoku dog wypada z rogu znowu (inaczej smuga go nie przywoła). */
  readonly summonCooldownMs: number;
  /** Po śmierci dog wraca do boku Barona po tylu ms. */
  readonly respawnMs: number;
}

/**
 * Chlust z wiadra (sprzątaczki, krok 125): po zamachu woda chlusta przed bossa — strefa `splashRadius` na miejscu
 * gracza (lekkie obrażenia, odrzut) i `count` kałuż (po wściekłości jedna więcej): pierwsza tam, dalsze w wachlarzu
 * `behindDistance` za graczem. Kałuża rośnie, leży `puddle.durationMs` i daje poślizg (`slip`) każdemu w niej.
 */
export interface SpillAttackDefinition extends BaseBossAttackDefinition {
  readonly splashRadius: number;
  readonly count: number;
  readonly behindDistance: number;
  readonly fanDeg: number;
  readonly puddle: { readonly startRadius: number; readonly maxRadius: number; readonly spreadMs: number; readonly durationMs: number };
  readonly slip: SlipEffect;
}

/**
 * Klucz bocianów (Brudna Wiedźma, krok 137): `lanes` równoległych pasów (we wściekłości o jeden więcej) w kierunku
 * wiedźma → bohater, środkowy przez bohatera, co `laneGap` px w poprzek — między pasami jest przejście. Pas to ciąg
 * stref co `step` px na długości `length`; po telegrafie bocian przelatuje pas w `flightMs` i każda strefa uderza,
 * gdy bocian nad nią przelatuje.
 */
export interface StorkFlightDefinition extends BaseBossAttackDefinition {
  readonly lanes: number;
  readonly laneGap: number;
  readonly length: number;
  readonly step: number;
  readonly radius: number;
  readonly flightMs: number;
}

/**
 * Pikowanie (Brudna Wiedźma, krok 137): ptaszek z ramienia znaczy `zoneCount` miejsc (we wściekłości o jedno więcej) —
 * pierwsze na bohaterze, kolejne wokół niego najwyżej `spread` px; co `intervalMs` w kolejne miejsce pikuje ptak
 * (widać go `diveMs` przed uderzeniem).
 */
export interface BirdDiveDefinition extends BaseBossAttackDefinition {
  readonly zoneCount: number;
  readonly zoneRadius: number;
  readonly spread: number;
  readonly intervalMs: number;
  readonly diveMs: number;
  /** Z jakiej wysokości nad miejscem spada ptak (px, tylko wygląd). */
  readonly diveHeight: number;
}

/**
 * Kwiat-oko (Brudna Wiedźma, krok 137): wiedźma rzuca `count` nasion (we wściekłości o jedno więcej) w odległości
 * `distance` od bohatera; nasiono leci `flightMs` i wyrasta w kwiat, który po `firstPulseMs` co `pulseIntervalMs`
 * wypuszcza pierścień `projectileCount` kul pyłku (`pulses` razy, każdy zapowiada `pulseTelegraphMs`), a potem więdnie.
 */
export interface FlowerEyeDefinition extends BaseBossAttackDefinition {
  readonly count: number;
  readonly distance: { readonly min: number; readonly max: number };
  readonly flightMs: number;
  readonly pulses: number;
  readonly firstPulseMs: number;
  readonly pulseIntervalMs: number;
  readonly pulseTelegraphMs: number;
  readonly projectileCount: number;
  readonly projectileSpeed: number;
  readonly projectileLifetimeMs: number;
  /** Kwiat na ziemi (tylko wygląd): promień po wyrośnięciu i czas rozrostu. */
  readonly flower: { readonly startRadius: number; readonly maxRadius: number; readonly spreadMs: number; readonly lingerMs: number };
}

/** Wir sukni (Brudna Wiedźma, krok 137): po telegrafie fala `radius` wokół wiedźmy i pierścień liści z jej sukni. */
export interface WhirlAttackDefinition extends BaseBossAttackDefinition {
  readonly radius: number;
  readonly projectileCount: number;
  readonly projectileSpeed: number;
  readonly projectileLifetimeMs: number;
}

/**
 * Okrzyki bossa (sprzątaczki, krok 125): napis nad głową. Na początku ataku z `attacks` (o ile od ostatniego minęło
 * `minGapMs`), a poza tym co `everyMs` linia z `idle`. Teksty w konfiguracji bossa — łatwo je zmienić.
 */
export interface BossShoutDefinition {
  readonly idle: readonly string[];
  readonly attacks: Readonly<Partial<Record<BossAttackKind, readonly string[]>>>;
  readonly everyMs: { readonly min: number; readonly max: number };
  readonly minGapMs: number;
  /** Okrzyk przy ucieczce windą (escape). */
  readonly escape?: string;
  /** Okrzyk przy wyjściu z windy w trakcie walki (blondynka w duecie, krok 126). */
  readonly arrive?: string;
}

/**
 * Unieruchomienie (plątanie brunetki, krok 126): trafiony nie chodzi i nie robi dasha przez `durationMs`, ale może
 * atakować. Potem przez `immunityMs` nie da się go unieruchomić znowu (koncept: nigdy dwa unieruchomienia naraz).
 */
export interface RootEffect {
  readonly durationMs: number;
  readonly immunityMs: number;
}

/**
 * Plątanie (brunetka, krok 126): miotła wbita w posadzkę, po telegrafie pod graczem wyrasta czarne włosie — strefa
 * `radius` na miejscu gracza z chwili planu (we wściekłości druga tam, dokąd biegnie). Lekkie obrażenia i `root`.
 */
export interface TangleAttackDefinition extends BaseBossAttackDefinition {
  readonly radius: number;
  readonly root: RootEffect;
  readonly lead: AimLead;
}

/**
 * Ucieczka windą (pomysł właściciela, krok 125): przy `hpRatio` HP boss przerywa walkę, w północnym murze areny
 * otwiera się winda, boss biegnie do niej (`speedMultiplier` × chód) i odjeżdża na górne piętro — to jego „pokonanie”
 * (łupy, karty, schody). Do tej chwili trafienia nie zbiją go poniżej 1 HP, więc ucieczka zawsze nastąpi.
 */
export interface BossEscapeDefinition {
  readonly hpRatio: number;
  readonly speedMultiplier: number;
  /** Drzwi otwierają się, gdy boss rusza do windy; przy drzwiach wsiada przez `boardMs`, potem zamykanie `closeMs`. */
  readonly boardMs: number;
  readonly closeMs: number;
}

/**
 * Kałuża szlamu (krok 153): rośnie od `startScale` promienia do pełnego przez `spreadMs` i leży `durationMs`.
 * Bohater, którego ślad stóp dotyka kałuży, jest lekko spowolniony (teren — chroni dash).
 */
export interface SludgePuddleDefinition {
  readonly startScale: number;
  readonly spreadMs: number;
  readonly durationMs: number;
  readonly slow: { readonly pct: number; readonly durationMs: number };
}

/**
 * Szlam od ścian (krok 153, pomysł właściciela — zapowiedź zwężającej się areny Kata Otchłani): od początku walki
 * szlam pełznie od brzegów areny do środka. Postęp to większy z dwóch: czas walki (`fullAfterMs` do pełnego) i
 * utracone HP bossa (`hpLostForFull` do pełnego). Pas ma najwyżej `maxDepthPx`, brzeg faluje o `wobble.amp` głębokości
 * (fala o długości `wobble.wavelengthPx` wzdłuż ściany), a widoczny pas dogania cel najwyżej `growPxPerSec`.
 * W pasie bohater jest spowolniony mocniej niż w kałuży — arena „zwęża się”, ale da się przez szlam przejść.
 */
export interface SludgeCreepDefinition {
  readonly maxDepthPx: number;
  readonly fullAfterMs: number;
  readonly hpLostForFull: number;
  readonly growPxPerSec: number;
  readonly wobble: { readonly amp: number; readonly wavelengthPx: number };
  readonly slow: { readonly pct: number; readonly durationMs: number };
}

export interface SludgeDefinition {
  readonly puddle: SludgePuddleDefinition;
  /** Promień kałuży po każdym ataku (px; brak = ten atak nie zostawia kałuży). Promienie z `SLUDGE_PUDDLE_RADII`. */
  readonly puddleRadius: Readonly<Partial<Record<BossAttackKind, number>>>;
  /** Kałuża tam, gdzie kula szlamu z pierścienia (Nova) rozbije się o mur albo opadnie. */
  readonly globPuddleRadius: number;
  /** Najwyżej tyle kałuż naraz — najstarsza znika. */
  readonly maxPuddles: number;
  readonly creep: SludgeCreepDefinition;
}

export interface BossEnrageConfig {
  /** Próg HP (0..1), poniżej którego boss wpada we wściekłość. */
  readonly hpThreshold: number;
  readonly telegraphMultiplier: number;
  readonly restMultiplier: number;
  /**
   * Kombinacje (krok 81): we wściekłości ataki ze wzoru idą seriami po `comboLength` — między atakami serii
   * tylko `comboGapMs` przerwy, pełna (skrócona wściekłością) przerwa dopiero po serii. Brak = bez serii.
   */
  readonly comboLength?: number;
  readonly comboGapMs?: number;
  /** Ryk przy wejściu we wściekłość (krok 81): fala wokół bossa, głównie odrzut. Brak = bez ryku. */
  readonly roar?: SlamAttackDefinition;
}

/**
 * Galerie areny (krok 44): w `sides` ścianach areny (najpierw tych bez wejść) wnęka głęboka na `depth` kafli,
 * odgrodzona kratą. Gdy kraty opadną, w każdej staje wróg `enemy` (dystansowy rzuca łukiem ponad kratą);
 * kraty galerii podnoszą się razem z resztą po pokonaniu bossa — wtedy wrogowie wychodzą.
 */
export interface ArenaGalleryDefinition {
  readonly sides: number;
  readonly depth: number;
  readonly enemy: EnemyType;
}

/**
 * Świta bossa (krok 80, prośba właściciela: pomocnicy w walce): co `everyMs` (po wściekłości `enragedEveryMs`)
 * na arenie pojawiają się znaczniki, a po `telegraphMs` wychodzą z nich zwykli wrogowie biomu (`type`).
 * `count` na wezwanie (po wściekłości jeden więcej), najwyżej `maxAlive` żywych naraz; z dala od gracza.
 */
export interface RetinueDefinition {
  readonly type: EnemyType;
  readonly firstAfterMs: number;
  readonly everyMs: number;
  readonly enragedEveryMs: number;
  readonly count: number;
  readonly maxAlive: number;
  readonly telegraphMs: number;
  /** Najmniejsza odległość miejsca wyjścia od gracza (kafle, Czebyszew). */
  readonly minPlayerDistanceTiles: number;
}

export interface BossDefinition {
  readonly id: BossId;
  readonly name: string;
  /** Tytuł pod imieniem na planszy otwierającej walkę (HUD); brak = bez planszy. */
  readonly title?: string;
  /** Dopisek przy imieniu na pasku HP po wściekłości (domyślnie „wściekły!”). */
  readonly enragedLabel?: string;
  readonly radius: number;
  readonly color: number;
  readonly maxHp: number;
  readonly moveSpeed: number;
  /** Boss podchodzi do gracza, dopóki nie znajdzie się bliżej niż ten dystans. */
  readonly engageDistance: number;
  /** Sprint (krok 27): dalej niż `distance` od gracza boss biegnie z prędkością `speed`. */
  readonly sprint?: { readonly speed: number; readonly distance: number };
  readonly openingDelayMs: number;
  readonly restBetweenAttacksMs: number;
  /** Sekwencja ataków powtarzana w kółko (wg GDD: sekwencyjne ataki obszarowe). */
  readonly pattern: readonly BossAttackKind[];
  /** Kolejność ataków ze wzoru; brak = po kolei (krok 31). */
  readonly patternOrder?: PatternOrder;
  /** Definicje ataków — wymagane tylko te, których używa `pattern`. */
  readonly slam?: SlamAttackDefinition;
  readonly nova?: NovaAttackDefinition;
  readonly barrage?: BarrageAttackDefinition;
  readonly brood?: BroodAttackDefinition;
  readonly web?: WebAttackDefinition;
  readonly leap?: LeapAttackDefinition;
  readonly lash?: LashAttackDefinition;
  readonly flurry?: FlurryAttackDefinition;
  readonly cocoonThrow?: CocoonThrowDefinition;
  readonly bloom?: BloomAttackDefinition;
  readonly cleave?: CleaveAttackDefinition;
  readonly call?: CallAttackDefinition;
  /** Spiżarnia i uczta (Grzybowy Pożeracz). */
  readonly feast?: FeastDefinition;
  /** Tarcza z przodu (Strażnik Bram, Kat Otchłani). */
  readonly shield?: ShieldDefinition;
  readonly hook?: HookAttackDefinition;
  readonly kindle?: KindleAttackDefinition;
  /** Smuga dymu (Baron Dymu). */
  readonly smoke?: SmokeAttackDefinition;
  /** Wyrzut zarodników (Grzybowy Pożeracz, krok 111). */
  readonly sporeVolley?: SporeVolleyDefinition;
  /** Chlust z wiadra (sprzątaczki, krok 125). */
  readonly spill?: SpillAttackDefinition;
  /** Plątanie miotłą (brunetka, krok 126). */
  readonly tangle?: TangleAttackDefinition;
  /** Klucz bocianów, pikowanie, kwiat-oko i wir sukni (Brudna Wiedźma, krok 137). */
  readonly storkFlight?: StorkFlightDefinition;
  readonly birdDive?: BirdDiveDefinition;
  readonly flowerEye?: FlowerEyeDefinition;
  readonly whirl?: WhirlAttackDefinition;
  /**
   * Druga faza (krok 137): od wejścia we wściekłość ataki biorą się z tego wzoru zamiast z `pattern`
   * (ta sama kolejność `patternOrder`). Brak = cały czas `pattern`.
   */
  readonly enragedPattern?: readonly BossAttackKind[];
  /** Okrzyki z napisami (sprzątaczki, krok 125). */
  readonly shouts?: BossShoutDefinition;
  /** Ucieczka windą zamiast śmierci (blond sprzątaczka, krok 125). */
  readonly escape?: BossEscapeDefinition;
  /** Ślad grzybów za bossem (Grzybowy Pożeracz, krok 111); też płaty z wyrzutu i skoku. */
  readonly trail?: FungalTrailDefinition;
  /** Dog Barona — boss-pomocnik. */
  readonly dog?: BossDogDefinition;
  /** Paleniska na arenie (Kat): tyle, rozstawione w ćwiartkach areny; buchają przy oddechu. */
  readonly arenaBraziers?: number;
  /** Galerie za kratami (Strażnik Bram, krok 44): wnęki w ścianach areny z wrogami dystansowymi. */
  readonly galleries?: ArenaGalleryDefinition;
  /** Świta (krok 80): zwykli wrogowie biomu przywoływani w trakcie walki. */
  readonly retinue?: RetinueDefinition;
  readonly fireRing?: FireRingDefinition;
  /**
   * Wygląd stref bez własnego `look` (krok 153): Król Szlamu ma fioletowe telegrafy i rozbryzgi szlamu zamiast
   * czerwieni i ognia. Brak = domyślny (czerwony telegraf, wybuch ognia).
   */
  readonly strikeLook?: AreaStrike['look'];
  /** Szlam Króla Szlamu (krok 153): kałuże po każdym pluciu i szlam pełznący od ścian areny. */
  readonly sludge?: SludgeDefinition;
  /** Pajączki z wylęgu (wymagane razem z `brood`). */
  readonly spiderling?: SpiderlingDefinition;
  readonly enrage: BossEnrageConfig;
}

/** Okrągła strefa obrażeń: telegrafowana od `telegraphStartAt`, uderza w `impactAt`. */
export interface AreaStrike {
  readonly center: Vector2;
  readonly radius: number;
  readonly telegraphStartAt: number;
  readonly impactAt: number;
  readonly damage: number;
  readonly knockback: number;
  /** Status nakładany trafieniem (trucizna smagnięcia). */
  readonly status?: StatusApplication;
  /** Trafienie gracza leczy bossa (kąsanie Pożeracza). */
  readonly healOnHit?: number;
  /** Trafienie przyciąga gracza w to miejsce (hak Kata). */
  readonly pullTo?: Vector2;
  /** Trafienie smugi dymu przywołuje doga (Baron Dymu). */
  readonly summonsDog?: boolean;
  /** Trafienie unieruchamia (plątanie brunetki, krok 126). */
  readonly root?: RootEffect;
  /** Wygląd strefy: dym zamiast czerwonego telegrafu; `spores` — czerwony telegraf, wybuch w kolorach soku (krok 111). */
  readonly look?: 'smoke' | 'spores' | 'water' | 'tangle' | 'embers' | 'dive' | 'whirl' | 'sludge';
}

/** Fala pocisków wystrzelonych równomiernie dookoła punktu. */
export interface ProjectileBurst {
  readonly origin: Vector2;
  readonly count: number;
  /** Obrót całej fali (rad) — kolejne fale są przesunięte, żeby nie było „bezpiecznych” linii. */
  readonly angleOffset: number;
  readonly speed: number;
  readonly damage: number;
  readonly knockback: number;
  readonly lifetimeMs: number;
  readonly telegraphStartAt: number;
  readonly fireAt: number;
  /** Wygląd pocisków: pyłek kwiatu-oka albo liście z wiru sukni (krok 137); brak = kule szlamu. */
  readonly look?: 'pollen' | 'leaf';
}

/**
 * Pajączek spadający z sufitu: w `telegraphStartAt` cień pojawia się w miejscu gracz + `offset`
 * (pozycja gracza z tej chwili), w `at` pajączek ląduje.
 */
export interface SummonSpawn {
  readonly offset: Vector2;
  readonly telegraphStartAt: number;
  readonly at: number;
}

/** Skok bossa `from` → `to` w [`launchAt`, `landAt`]; uderzenie przy lądowaniu to osobna strefa w `strikes`. */
export interface BossLeap {
  readonly from: Vector2;
  readonly to: Vector2;
  readonly telegraphStartAt: number;
  readonly launchAt: number;
  readonly landAt: number;
}

/** Rzucona sieć: lot `from` → `to` w [`launchAt`, `landAt`], potem plama rośnie i leży do `expiresAt`. */
export interface WebShot {
  readonly from: Vector2;
  readonly to: Vector2;
  readonly telegraphStartAt: number;
  readonly launchAt: number;
  readonly landAt: number;
  readonly startRadius: number;
  readonly maxRadius: number;
  readonly spreadMs: number;
  readonly expiresAt: number;
  /** Spowolnienie w płacie; brak = bez spowolnienia (kałuża sprzątaczki ślizga zamiast spowalniać). */
  readonly slow?: { readonly pct: number; readonly durationMs: number };
  /** Poślizg w płacie (kałuża sprzątaczki, krok 125). */
  readonly slip?: SlipEffect;
  /**
   * Wygląd płatu: sieć (Matka Pająków), grzybnia (Król), grzyby (Pożeracz, krok 111) albo kałuża mydlin
   * (sprzątaczki, krok 125). Brak = sieć. Grzyby i kałuża łapią ślad stóp bohatera (jak strefy z kroku 110),
   * sieć i grzybnia — środek postaci.
   */
  readonly look?: 'web' | 'mycelium' | 'mushrooms' | 'water' | 'flower' | 'sludge';
  /** Dodatkowy status w płacie (trucizna grzybni). */
  readonly status?: StatusApplication;
}

/** Rzucony przedmiot (kokon Króla): tylko lot do pokazania; obrażenia daje strefa w `strikes`. */
export interface ThrownObject {
  /** Co leci: kokon Króla (domyślnie), puszka Barona, strąk Pożeracza, wiadro sprzątaczki; bocian, ptak i nasiono wiedźmy (krok 137). */
  readonly look?: 'can' | 'spore' | 'bucket' | 'stork' | 'bird' | 'seed' | 'phlegm';
  readonly from: Vector2;
  readonly to: Vector2;
  readonly launchAt: number;
  readonly landAt: number;
}

/** Pełny plan jednego ataku — wszystko z góry zaplanowane w czasie, wykonuje warstwa Phasera. */
export interface BossAttackPlan {
  readonly kind: BossAttackKind;
  readonly strikes: readonly AreaStrike[];
  readonly bursts: readonly ProjectileBurst[];
  readonly spawns: readonly SummonSpawn[];
  readonly webs: readonly WebShot[];
  readonly leap: BossLeap | null;
  readonly throws: readonly ThrownObject[];
  /** Uczta (Grzybowy Pożeracz). */
  readonly feast?: FeastBite;
  /** Zew spiżarni (Grzybowy Pożeracz). */
  readonly release?: LarderRelease;
  /** Kiedy boss może znów się ruszać. */
  readonly endsAt: number;
}
