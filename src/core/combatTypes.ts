/** Typy domenowe walki — czyste dane, bez zależności od Phasera. */
import type { Vector2 } from '@/core/types';

export enum EnemyType {
  Rusher = 'rusher',
  Kiter = 'kiter',
}

/** Rytm przenikania upiora: tyle ms cielesny, potem tyle bezcielesny (w pętli). */
export interface PhasingDefinition {
  readonly solidMs: number;
  readonly phasedMs: number;
}

/** Cecha elity (krok 42): zwykły wróg z jedną albo kilkoma cechami jest elitą. */
export enum EliteAffix {
  /** Zostawia za sobą smugę żaru, po śmierci płonącą kałużę. */
  Fiery = 'fiery',
  /** Tarcza od frontu: z przodu przyjmuje tylko część obrażeń; obraca się powoli. */
  Shielded = 'shielded',
  /** Szybszy chód, krótszy zamach i przerwa między atakami. */
  Swift = 'swift',
  /** Trafienie gracza leczy elitę. */
  Vampiric = 'vampiric',
  /** Po śmierci wybucha (zapowiedziana strefa). */
  Volatile = 'volatile',
}

/**
 * Wariant archetypu w biomie (krok 23b): wygląd, kolor i ewentualnie inny atak, ta sama logika AI.
 * Ruiny: Trashcan Man (Rusher), Demon Mage (Kiter). Pajęcze leże: pająk jaskiniowy, nietoperz.
 */
export enum EnemyVariant {
  TrashcanMan = 'trashcan-man',
  DemonMage = 'demon-mage',
  CaveSpider = 'cave-spider',
  Bat = 'bat',
  /** Grzybnia (krok 28b): pająk porośnięty grzybem (Rusher), ugryzienie zatruwa. */
  InfectedSpider = 'infected-spider',
  /** Grzybnia (krok 28b): grzybiec plujący kulą zarodników (Kiter), trafienie zatruwa. */
  Fungoid = 'fungoid',
  /** Cmentarzysko (krok 32b): zarażony człowiek zmieniający się w grzybowe zombie (Rusher), drapnięcie zatruwa. */
  Zombie = 'zombie',
  /** Cmentarzysko (krok 32b): siewca — zombie z kapeluszem grzyba zamiast głowy (Kiter), pluje kulą zarodników. */
  Sower = 'sower',
  /** Piekło (krok 41d): piekielny ogar (Rusher) — skok-szarża po prostej, zostawia smugę żaru. */
  Hellhound = 'hellhound',
  /** Piekło (krok 41d): kultysta popiołu (Kiter) — rzuca łukiem bombę smolną, po wybuchu płonie kałuża. */
  Cultist = 'cultist',
  /** Zadymiona palarnia (krok 84): wielki czarny dog (Rusher) — biegnie i gryzie; wypada też ze ściany pokoju. */
  BlackDog = 'black-dog',
  /** Zasadzki (krok 49): upiór (Rusher) — przenika (chwilami bezcielesny i nietykalny), dotyk mrozi i spowalnia. */
  Ghost = 'ghost',
}

/** Stany maszyny stanów AI (wg GDD: IDLE, CHASE, ATTACK). */
export enum EnemyState {
  Idle = 'idle',
  Chase = 'chase',
  Attack = 'attack',
}

/** Faza cyklu ataku: zamach (telegraf) → odnowienie → gotowość. */
export enum AttackPhase {
  Ready = 'ready',
  Windup = 'windup',
  Recovery = 'recovery',
}

export enum EnemyAttackKind {
  Melee = 'melee',
  Projectile = 'projectile',
  /** Skok-szarża po prostej w miejsce gracza z chwili zamachu (ogar, krok 41d). */
  Pounce = 'pounce',
  /** Rzut łukiem w miejsce gracza z chwili rzutu; strefa upadku widoczna w locie (kultysta, krok 41d). */
  Lob = 'lob',
}

/** Podpalenie: obrażenia co `tickMs` przez `durationMs`. Ponowne podpalenie odświeża czas. */
export interface BurnEffect {
  readonly tickDamage: number;
  readonly tickMs: number;
  readonly durationMs: number;
}

/** Spowolnienie: prędkość ruchu × (1 − pct). */
export interface SlowEffect {
  readonly pct: number;
  readonly durationMs: number;
}

/** Ogłuszenie: cel stoi i nie atakuje. Czas skraca odporność celu (boss). */
export interface StunEffect {
  readonly durationMs: number;
}

/** Paraliż (krok 29, Król Pająków): cel nie chodzi, nie atakuje, nie strzela i nie robi dasha. */
export interface ParalysisEffect {
  readonly durationMs: number;
}

/** Trucizna (krok 27, Matka Pająków): obrażenia co `tickMs` przez `durationMs` — mechanika jak podpalenie. */
export type PoisonEffect = BurnEffect;

/** Efekty statusu nakładane trafieniem (z przedmiotów gracza, trucizna z ciosu Matki Pająków). */
export interface StatusApplication {
  readonly burn?: BurnEffect;
  readonly poison?: PoisonEffect;
  readonly paralysis?: ParalysisEffect;
  readonly slow?: SlowEffect;
  readonly stun?: StunEffect;
}

/** Jak cel znosi efekty statusu — boss jest odporniejszy niż zwykli wrogowie. */
export interface StatusResistance {
  /** Mnożnik czasu ogłuszenia (0.4 = 40% czasu). */
  readonly stunMultiplier: number;
  /** Po ogłuszeniu cel jest na nie odporny przez ten czas (chroni przed zablokowaniem serią). */
  readonly stunImmunityMs: number;
  /** Mnożnik siły spowolnienia. */
  readonly slowMultiplier: number;
  /** Po paraliżu cel jest na niego odporny przez ten czas (krok 29: Król nie zamknie gracza serią). */
  readonly paralysisImmunityMs?: number;
  /** Krok 93: mnożnik obrażeń tyknięcia podpalenia (domyślnie 1; boss 0,5). */
  readonly burnMultiplier?: number;
}

/** Pojedyncze trafienie: ile obrażeń i jaki odrzut (px/s) otrzymuje cel. */
export interface Hit {
  readonly damage: number;
  readonly knockback: Vector2;
  readonly status?: StatusApplication;
  /** Magia Czarodziejki (krok 49b): trafia zawsze — także bezcielesnego albo wynurzającego się upiora. */
  readonly magic?: boolean;
  /** Wybuch spadający z góry (bomba, krok 99): tarcza Tarczownika go nie zatrzymuje. */
  readonly unblockable?: boolean;
}

/** Efekty broni gracza wynikające z przedmiotów (zero/puste = brak przedmiotu). */
export interface WeaponEffects {
  /** Ilu dodatkowych wrogów przebija strzał. */
  readonly shotPierce: number;
  /** Statusy nakładane strzałem (ogłuszenie, spowolnienie). */
  readonly shotStatus: StatusApplication;
  /** Statusy nakładane ciosem wręcz (podpalenie). */
  readonly meleeStatus: StatusApplication;
  /** Leczenie za cios wręcz, który trafił co najmniej jeden cel. */
  readonly meleeHeal: number;
  /** Minimalny odstęp między leczeniami za cios (ms). */
  readonly meleeHealCooldownMs: number;
  /** Krok 93: sufit leczenia kła — część maks. HP na sekundę (0, gdy brak kła). */
  readonly meleeHealMaxHpPctPerSec: number;
  /** Obrażenia zadawane wrogom, przez których gracz przelatuje dashem (0 = brak). */
  readonly dashDamage: number;
}

export interface DamageResult {
  readonly dealt: number;
  readonly died: boolean;
}

interface BaseAttackDefinition {
  readonly damage: number;
  /** Dystans (środek–środek, px), z którego AI rozpoczyna atak. */
  readonly range: number;
  /** Czas zamachu — telegraf, w którym gracz może zareagować. */
  readonly windupMs: number;
  /** Czas od rozpoczęcia ataku do gotowości następnego. */
  readonly cooldownMs: number;
  readonly knockback: number;
  /** Status nakładany trafieniem (krok 28b: trucizna wrogów Grzybni). */
  readonly status?: StatusApplication;
}

export interface MeleeAttackDefinition extends BaseAttackDefinition {
  readonly kind: EnemyAttackKind.Melee;
  /** Faktyczny zasięg trafienia w chwili uderzenia (po zamachu). */
  readonly hitRange: number;
}

/** Kształt fali (półksiężyc) w układzie lotu: szeroka w poprzek, wąska wzdłuż. */
export interface WaveShape {
  /** Połowa szerokości w poprzek lotu (px). */
  readonly halfWidth: number;
  /** Połowa grubości wzdłuż lotu (px). */
  readonly halfDepth: number;
}

export interface ProjectileAttackDefinition extends BaseAttackDefinition {
  readonly kind: EnemyAttackKind.Projectile;
  readonly projectileSpeed: number;
  readonly projectileLifetimeMs: number;
  /** Fala zamiast kulki (nietoperz): trafia w całej szerokości półksiężyca. */
  readonly wave?: WaveShape;
}

/** Płonący ślad na podłodze (smuga ogara, kałuża smoły): parzy gracza jak teren, wrogów nie. */
export interface FirePatchDefinition {
  readonly radius: number;
  readonly durationMs: number;
  readonly damage: number;
}

export interface PounceAttackDefinition extends BaseAttackDefinition {
  readonly kind: EnemyAttackKind.Pounce;
  /** Prędkość skoku (px/s). */
  readonly speed: number;
  /** Najdalszy skok (px) — cel dalej niż to skraca skok do tej długości. */
  readonly maxDistance: number;
  /** Trafia gracza, gdy środki są bliżej niż tyle + promień gracza (raz na skok). */
  readonly hitRadius: number;
  /** Po chybionym skoku stoi tyle ms (okno na kontrę). */
  readonly missRecoveryMs: number;
  /** Smuga żaru: plamy co `spacing` px wzdłuż toru skoku. */
  readonly trail: FirePatchDefinition & { readonly spacing: number };
}

export interface LobAttackDefinition extends BaseAttackDefinition {
  readonly kind: EnemyAttackKind.Lob;
  /** Czas lotu bomby (ms) — tyle trwa telegraf strefy upadku. */
  readonly flightMs: number;
  /** Promień wybuchu (obrażenia `damage`). */
  readonly blastRadius: number;
  /** Kałuża płonącej smoły po wybuchu. */
  readonly patch: FirePatchDefinition;
}

export type EnemyAttackDefinition = MeleeAttackDefinition | ProjectileAttackDefinition | PounceAttackDefinition | LobAttackDefinition;

/** Utrzymywanie dystansu przez przeciwników dystansowych. */
export interface KitingBehaviour {
  /** Powyżej tego dystansu podchodzi bliżej. */
  readonly preferredRange: number;
  /** Poniżej tego dystansu ucieka od gracza. */
  readonly retreatRange: number;
}

export interface EnemyBehaviour {
  /** Zasięg wykrycia gracza (wymaga linii wzroku). */
  readonly aggroRange: number;
  readonly kiting?: KitingBehaviour;
}

/**
 * Wróg atakuje tylko z obszaru, który gracz na pewno widzi na ekranie (krok 18, zoom 2,0),
 * i nie ucieka poza niego. Wymiary w px świata, względem pozycji gracza.
 */
export interface EnemyViewRule {
  /** Połowy boków prostokąta zawsze widocznego wokół gracza. */
  readonly halfX: number;
  readonly halfY: number;
  /** Zapas od krawędzi (sylwetka wroga ma być cała widoczna). */
  readonly margin: number;
  /** Ucieczka (kiting) zatrzymuje się tyle px przed granicą — bez drgania na krawędzi. */
  readonly retreatSlack: number;
}

export interface EnemyDefinition {
  readonly type: EnemyType;
  readonly variant: EnemyVariant;
  readonly radius: number;
  readonly color: number;
  readonly maxHp: number;
  readonly moveSpeed: number;
  readonly attack: EnemyAttackDefinition;
  readonly behaviour: EnemyBehaviour;
  /** Przenikanie upiora (krok 49): na przemian cielesny i bezcielesny (wtedy nietykalny i nie atakuje). */
  readonly phasing?: PhasingDefinition;
  /** Cechy elity (krok 42); brak albo pusto = zwykły wróg. */
  readonly affixes?: readonly EliteAffix[];
}

export interface DashConfig {
  readonly speed: number;
  readonly durationMs: number;
  readonly cooldownMs: number;
}

/** Atak dystansowy gracza (PPM): strzał z puli ładunków odnawiających się z czasem. */
export interface RangedConfig {
  readonly damage: number;
  readonly knockback: number;
  readonly projectileSpeed: number;
  readonly projectileLifetimeMs: number;
  readonly projectileRadius: number;
  readonly maxCharges: number;
  /** Czas odnowienia jednego ładunku. */
  readonly rechargeMs: number;
  /** Minimalny odstęp między strzałami (żeby seria nie wyszła w jednej klatce). */
  readonly shotIntervalMs: number;
}

export interface PlayerCombatConfig {
  readonly meleeDamage: number;
  readonly meleeRange: number;
  readonly meleeArcDeg: number;
  readonly attackCooldownMs: number;
  readonly knockback: number;
  /** Nietykalność po otrzymaniu trafienia. */
  readonly invulnerabilityMs: number;
  readonly dash: DashConfig;
  readonly ranged: RangedConfig;
}

export interface EnemyScalingConfig {
  /** Przyrost HP na każde piętro powyżej pierwszego (0.15 = +15%). */
  readonly hpPerFloor: number;
  readonly damagePerFloor: number;
}
