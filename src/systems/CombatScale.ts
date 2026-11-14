import type { CrackConfig, ScaleSnapshot, StreakConfig } from '@/core/combatWeightTypes';

/** Atak w toku: z ilu części (salwa = kilka strzał), ile jeszcze leci i czy już trafił. */
interface AttackTally {
  open: number;
  landed: boolean;
}

/**
 * Szala bohatera (krok U11a, wersja lekka systemu wag — docs/WAGI.md §11). Czysta logika z jawnym czasem.
 *
 * - **Passa:** każdy atak, który trafi choć jednego wroga, to +1 (jeden zamach w pięciu wrogów to nadal +1).
 *   Progi I–III dają bonus obrażeń. Pudło (atak bez trafienia) i dłuższa przerwa zbijają Passę o jeden próg.
 * - **Odsłonięcie:** przyjęty cios zeruje Passę i dodaje pęknięcie (do III); każde pęknięcie zwiększa obrażenia w nas.
 *   Pęknięcia schodzą, gdy znowu trafiamy (co `hitsToMend` trafień), albo po dłuższym spokoju. Dopóki są pęknięcia,
 *   trafienia najpierw je zdejmują, a dopiero potem budują Passę — obie strony Szali się wykluczają.
 *
 * Wyłączona Szala (`enabled = false`) niczego nie liczy, a jej mnożniki to 1.
 */
export class CombatScale {
  private hits = 0;
  private crackCount = 0;
  private mendHits = 0;
  private lastLandAt = 0;
  private lastCalmAt = 0;
  private nextAttackId = 1;
  private readonly attacks = new Map<number, AttackTally>();

  constructor(
    private readonly streakConfig: StreakConfig,
    private readonly crackConfig: CrackConfig,
    readonly enabled: boolean,
  ) {}

  get streak(): number {
    return this.hits;
  }

  get cracks(): number {
    return this.crackCount;
  }

  /** Próg Passy 0…III. */
  get tier(): number {
    return streakTier(this.hits, this.streakConfig.tiers);
  }

  /** Pęknięcia na maksimum (III) — okno na atak kary. */
  get isBroken(): boolean {
    return this.enabled && this.crackCount >= this.crackConfig.max;
  }

  /**
   * Passa III (krok U11b): nasze ataki są ciężkie — trafiony wróg w zamachu traci zamach i jest ogłuszony.
   */
  get isHeavy(): boolean {
    return this.enabled && this.tier >= this.streakConfig.tiers.length;
  }

  /** Mnożnik naszych obrażeń z Passy. */
  get outgoingMultiplier(): number {
    const tier = this.tier;
    return tier > 0 ? 1 + (this.streakConfig.damageBonus[tier - 1] ?? 0) : 1;
  }

  /** Mnożnik obrażeń w nas z pęknięć. */
  get incomingMultiplier(): number {
    return 1 + this.crackCount * this.crackConfig.damageTakenPerCrack;
  }

  snapshot(): ScaleSnapshot {
    return { streak: this.hits, tier: this.tier, cracks: this.crackCount };
  }

  /** Atak natychmiastowy (cios, impuls promienia): trafił albo spudłował. */
  strike(landed: boolean, now: number): void {
    if (landed) this.land(now);
    else this.miss();
  }

  /**
   * Atak z pocisków w locie: zwraca numer, pod którym części (strzały salwy) zgłaszają trafienie i koniec lotu.
   * Wyłączona Szala zwraca 0 — numer, którego nikt nie liczy.
   */
  begin(parts = 1): number {
    if (!this.enabled || parts <= 0) return 0;
    const id = this.nextAttackId++;
    this.attacks.set(id, { open: parts, landed: false });
    return id;
  }

  /** Część ataku trafiła stworzenie — atak liczy się raz, choćby trafiły wszystkie strzały salwy. */
  landPart(id: number, now: number): void {
    const tally = this.attacks.get(id);
    if (!tally || tally.landed) return;
    tally.landed = true;
    this.land(now);
  }

  /** Część ataku skończyła lot (mur, wygaśnięcie, ostatnie przebicie); gdy żadna nie trafiła — pudło. */
  endPart(id: number): void {
    const tally = this.attacks.get(id);
    if (!tally) return;
    tally.open--;
    if (tally.open > 0) return;
    this.attacks.delete(id);
    if (!tally.landed) this.miss();
  }

  /** Przyjęty cios: Passa do zera, pęknięcie więcej. */
  hurt(now: number): void {
    if (!this.enabled) return;
    this.hits = 0;
    this.crackCount = Math.min(this.crackConfig.max, this.crackCount + 1);
    this.mendHits = 0;
    this.lastCalmAt = now;
  }

  /** Co klatkę: przerwa bez trafienia zbija Passę, spokój bez ciosów zdejmuje pęknięcie. */
  update(now: number): void {
    if (!this.enabled) return;
    if (this.hits > 0 && now - this.lastLandAt >= this.streakConfig.decayMs) {
      this.hits = dropStreakTier(this.hits, this.streakConfig.tiers);
      this.lastLandAt = now;
    }
    if (this.crackCount > 0 && now - this.lastCalmAt >= this.crackConfig.calmMendMs) {
      this.crackCount--;
      this.mendHits = 0;
      this.lastCalmAt = now;
    }
  }

  /** Śmierć, powalenie albo nowe piętro: Szala wraca do środka. */
  reset(): void {
    this.hits = 0;
    this.crackCount = 0;
    this.mendHits = 0;
    this.attacks.clear();
  }

  private land(now: number): void {
    if (!this.enabled) return;
    this.lastLandAt = now;
    if (this.crackCount > 0) {
      // Najpierw odgryzamy się: trafienia zdejmują pęknięcia, dopiero potem rośnie Passa.
      if (++this.mendHits >= this.crackConfig.hitsToMend) {
        this.crackCount--;
        this.mendHits = 0;
        this.lastCalmAt = now;
      }
      return;
    }
    this.hits++;
  }

  private miss(): void {
    if (!this.enabled) return;
    this.hits = dropStreakTier(this.hits, this.streakConfig.tiers);
  }
}

/** Próg Passy dla liczby trafień: tyle progów, ile jest osiągniętych. */
export function streakTier(hits: number, tiers: readonly number[]): number {
  let tier = 0;
  for (const threshold of tiers) if (hits >= threshold) tier++;
  return tier;
}

/** Passa o próg niżej: na początek poprzedniego progu (poniżej progu I — zero). */
export function dropStreakTier(hits: number, tiers: readonly number[]): number {
  const tier = streakTier(hits, tiers);
  return tier >= 2 ? (tiers[tier - 2] ?? 0) : 0;
}

/** Wyłącznik z adresu (`?wagi=0|1`); bez parametru — wartość z configu. */
export function weightsEnabled(search: string, fallback: boolean): boolean {
  const value = new URLSearchParams(search).get('wagi');
  if (value === '0') return false;
  if (value === '1') return true;
  return fallback;
}

/** Obrażenia po mnożniku Szali (co najmniej 1, jak reszta obrażeń w grze). */
export function scaledDamage(damage: number, multiplier: number): number {
  return multiplier === 1 ? damage : Math.max(1, Math.round(damage * multiplier));
}
