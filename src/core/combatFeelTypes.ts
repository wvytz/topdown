/** Zdarzenia, które zatrzymują obraz (hitstop, krok U2, STYLEGUIDE §13.5). */
export enum HitstopKind {
  /** Jedno trafienie za co najmniej `heavyHitDamage`. */
  HeavyHit = 'heavy-hit',
  /** Zabicie elity. */
  EliteKill = 'elite-kill',
  /** Ostatni cios w bossa. */
  BossKill = 'boss-kill',
}

/** Co efekty feelu walki robią na jednym poziomie jakości (krok U2). Niska = wszystko wyłączone. */
export interface CombatFeelLevel {
  /** Iskry trafienia nad mrokiem. */
  readonly hitSparks: boolean;
  /** Smuga cięcia z pikseli w barwie klasy (zamiast białego wycinka koła). */
  readonly slashTrail: boolean;
  /** Rozpad wroga na kawałki przy śmierci. */
  readonly shatter: boolean;
  /** Pierścień i iskry wybuchu także nad mrokiem. */
  readonly blastOverDark: boolean;
  /** Małe światło pocisków wrogów. */
  readonly projectileHalo: boolean;
  /** Trafiony bohater błyska barwą ostrzegawczą. */
  readonly heroHurtFlash: boolean;
  /** Hitstop (przy „mniej błysków” i tak wyłączony). */
  readonly hitstop: boolean;
  /** Liczba kawałków rozpadu zwykłego wroga. */
  readonly shatterPieces: number;
  /** Liczba iskier jednego trafienia. */
  readonly sparkCount: number;
}

/** Kawałek rozpadu: przesunięcie od środka wroga w kolejnych klatkach efektu (piksele, całkowite). */
export interface ShatterPiece {
  readonly frames: readonly { readonly x: number; readonly y: number }[];
  /** Indeks barwy z listy przekazanej do `shatterPieces` (barwa wroga albo cech elity). */
  readonly colorIndex: number;
}
