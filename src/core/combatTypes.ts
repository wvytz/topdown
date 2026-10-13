/** Typy domenowe walki — czyste dane, bez zależności od Phasera. */
import type { Vector2 } from '@/core/types';

export enum EnemyType {
  Rusher = 'rusher',
  Kiter = 'kiter',
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

/** Efekty statusu nakładane trafieniem (z przedmiotów gracza). */
export interface StatusApplication {
  readonly burn?: BurnEffect;
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
}

/** Pojedyncze trafienie: ile obrażeń i jaki odrzut (px/s) otrzymuje cel. */
export interface Hit {
  readonly damage: number;
  readonly knockback: Vector2;
  readonly status?: StatusApplication;
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
}

export interface MeleeAttackDefinition extends BaseAttackDefinition {
  readonly kind: EnemyAttackKind.Melee;
  /** Faktyczny zasięg trafienia w chwili uderzenia (po zamachu). */
  readonly hitRange: number;
}

export interface ProjectileAttackDefinition extends BaseAttackDefinition {
  readonly kind: EnemyAttackKind.Projectile;
  readonly projectileSpeed: number;
  readonly projectileLifetimeMs: number;
}

export type EnemyAttackDefinition = MeleeAttackDefinition | ProjectileAttackDefinition;

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
  readonly radius: number;
  readonly color: number;
  readonly maxHp: number;
  readonly moveSpeed: number;
  readonly attack: EnemyAttackDefinition;
  readonly behaviour: EnemyBehaviour;
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
