/**
 * System wag, wersja lekka (krok U11a, docs/WAGI.md §11): typy Szali i ataku kary. Czysta logika, bez Phasera.
 */

/** Passa (combo): progi i bonus obrażeń. */
export interface StreakConfig {
  /** Trafienia potrzebne do progu I, II i III (rosnąco). */
  readonly tiers: readonly number[];
  /** Bonus obrażeń na progu I, II i III (0,1 = +10%). */
  readonly damageBonus: readonly number[];
  /** Tyle ms bez trafienia zbija Passę o jeden próg. */
  readonly decayMs: number;
}

/** Odsłonięcie (pęknięcia): kara za przyjęte ciosy. */
export interface CrackConfig {
  /** Najwięcej pęknięć (III). */
  readonly max: number;
  /** Dodatkowe obrażenia w nas za każde pęknięcie (0,12 = +12%). */
  readonly damageTakenPerCrack: number;
  /** Tyle naszych trafień zdejmuje jedno pęknięcie. */
  readonly hitsToMend: number;
  /** Tyle ms bez przyjętego ciosu zdejmuje jedno pęknięcie (zapas, żeby III nie trwało wiecznie). */
  readonly calmMendMs: number;
}

/** Rodzaj ataku kary (§5): strzelec — przeszywający strzał, wręcz — taran. */
export enum PunishKind {
  PiercingShot = 'piercing-shot',
  Ram = 'ram',
}

/** Przeszywający strzał: celowanie z czerwoną linią, zamrożenie celownika, szybki pocisk przez wrogów. */
export interface PiercingShotConfig {
  /** Najbliżej i najdalej od bohatera (px), skąd strzelec może karać. */
  readonly minRange: number;
  readonly maxRange: number;
  /** Cały telegraf (ms); ostatnie `freezeMs` celownik stoi. */
  readonly aimMs: number;
  readonly freezeMs: number;
  /** Lot pocisku (px/s) i zasięg (px) — do pierwszego muru. */
  readonly speed: number;
  readonly range: number;
  /** Pocisk trafia bohatera, gdy jego środek jest bliżej toru niż promień ciała + tyle. */
  readonly halfWidth: number;
  /** Obrażenia względem zwykłego ataku strzelca. */
  readonly damageMultiplier: number;
  readonly knockback: number;
}

/** Ustawienia ataku kary (§5): okno, zasięgi i oba ataki. */
export interface PunishConfig {
  /** Najwyżej jeden atak kary na tyle ms. */
  readonly cooldownMs: number;
  readonly piercingShot: PiercingShotConfig;
  /** Taran (rozbieg w linii prostej) — parametry jak szarża Tarczownika. */
  readonly ram: {
    readonly minRange: number;
    readonly maxRange: number;
    readonly windupMs: number;
    readonly speed: number;
    readonly maxDistance: number;
    readonly hitRadius: number;
    readonly damageMultiplier: number;
    readonly knockback: number;
    /** Ogłuszenie po wbiciu w ścianę — okno na kontrę. */
    readonly wallStunMs: number;
    readonly missRecoveryMs: number;
    readonly hitRecoveryMs: number;
    readonly wallGraceMs: number;
  };
}

/** Wygląd sygnalizacji (arcade, bez krwi): licznik Passy, pęknięcia i czerwień kary. */
export interface WeightVisualConfig {
  /** Licznik pokazujemy od tylu trafień. */
  readonly counterFrom: number;
  /** Barwa licznika przed progiem I, na progu I i II; na III — barwa klasy. */
  readonly counterColors: readonly [string, string, string];
  /** Przesunięcie licznika od środka bohatera (px). */
  readonly counterOffset: { readonly x: number; readonly y: number };
  /** Pęknięcia: barwa, obwódka i kąty (stopnie) kolejnych rys na obrysie bohatera. */
  readonly crackColor: number;
  readonly crackOutline: number;
  readonly crackAnglesDeg: readonly number[];
  /** Odległość rys od środka bohatera (px) i długość rysy (px). */
  readonly crackRadius: number;
  readonly crackLength: number;
  /** Okres pulsowania rys (ms) przy I, II i III. */
  readonly crackPulseMs: readonly number[];
  /** Czerwień kary: linia, pas taranu i napis „!!”. */
  readonly punishColor: number;
  readonly punishCss: string;
  /** Lekkie zabarwienie karzącego wroga (jasna czerwień — sylwetka czytelna, bez skojarzeń z krwią). */
  readonly punishTint: number;
}

/**
 * Waga ataku (§2 WAGI.md, wersja lekka — krok U11b): wspólny język ostrzeżeń w zamachu.
 * Lekki i średni — bez nowego znaku (zostaje pomarańczowy odcień zamachu), ciężki — pomarańczowe „!”,
 * przebijający (atak kary) — czerwone „!!” z linią albo strefą.
 */
export enum AttackWeight {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
  Piercing = 'piercing',
}

/** Ciężkie ciosy bohatera na Passie III (krok U11b): trafienie wroga w zamachu przerywa zamach i ogłusza. */
export interface HeavyStrikeConfig {
  /** Ogłuszenie wroga, któremu przerwaliśmy zamach (ms, przed odpornością). */
  readonly staggerMs: number;
}

/** Znak ciężkiego zamachu wroga nad głową. */
export interface WeightMarkConfig {
  readonly heavyText: string;
  readonly heavyCss: string;
  /** Miganie znaku (ms na fazę). */
  readonly blinkMs: number;
  /** „!” wroga tyle px nad brzegiem ciała — ponad nazwą elity. */
  readonly raisePx: number;
  /** „!!” bossa tyle px nad brzegiem ciała. */
  readonly gapPx: number;
}

/** Atak kary bossa (§5): istniejący atak obszarowy bossa dostaje wagę przebijającą, gdy bohater ma pęknięcia III. */
export interface BossPunishConfig {
  /** Obrażenia stref tego ataku (względem zwykłych). */
  readonly damageMultiplier: number;
  /** Czerwony obrys stref w telegrafie: grubość (px) i okres pulsu (ms). */
  readonly ringWidth: number;
  readonly pulseMs: number;
}

/** Telefon (krok U11b): licznik czytelny na małym ekranie. */
export interface WeightMobileConfig {
  /** O tyle większy krój licznika Passy niż na PC. */
  readonly counterSizeBonus: number;
  /** Przesunięcie licznika przy większym kroju (px). */
  readonly counterOffset: { readonly x: number; readonly y: number };
}

export interface CombatWeightConfig {
  /** Wyłącznik całego systemu (`?wagi=0|1` nadpisuje). */
  readonly enabled: boolean;
  readonly streak: StreakConfig;
  readonly cracks: CrackConfig;
  readonly punish: PunishConfig;
  readonly heavy: HeavyStrikeConfig;
  readonly marks: WeightMarkConfig;
  readonly bossPunish: BossPunishConfig;
  readonly mobile: WeightMobileConfig;
  readonly visual: WeightVisualConfig;
}

/** Stan Szali do rysowania. */
export interface ScaleSnapshot {
  /** Trafienia w bieżącej Passie. */
  readonly streak: number;
  /** Próg Passy 0…III. */
  readonly tier: number;
  /** Pęknięcia 0…III. */
  readonly cracks: number;
}
