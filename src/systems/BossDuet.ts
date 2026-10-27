import type { BossHudData, Vector2 } from '@/core/types';
import type { BossId } from '@/core/bossTypes';
import type { TowerLoopConfig } from '@/systems/TowerLoop';
import { floorInLoop } from '@/systems/TowerLoop';

/**
 * Duet bossów (krok 114, pomysł właściciela): na wybranej arenie walczą naraz dwaj bossowie — gospodarz areny
 * i partner z innego piętra kręgu (np. Król Pająków z Matką Pająków). Utrudnienie, na razie tylko w arenach.
 * Czysta logika: który duet na którym piętrze i wspólny pasek HP.
 */
export interface BossDuetDefinition {
  /** Piętro w kręgu, którego arena dostaje duet (gospodarz = boss tego piętra). */
  readonly floorInLoop: number;
  /** Partner (jego definicja, skalowana do bieżącego piętra). */
  readonly partner: BossId;
  /** Bossowie stają po bokach środka areny, tyle kafli od niego (gospodarz po lewej, partner po prawej). */
  readonly spawnOffsetTiles: number;
  /** Najmniejszy odstęp między ciałami bossów (px) — rozpychają się, zamiast stać jeden w drugim. */
  readonly bodyGapPx: number;
  /** Mnożnik HP obu bossów duetu (1 = pełne HP każdego). */
  readonly hpMultiplier: number;
  /** Czy partner przywołuje własną świtę (gospodarz zawsze swoją). */
  readonly partnerRetinue: boolean;
  /** Napis paska i planszy. */
  readonly name: string;
  readonly title: string;
  /** Partner dochodzi w trakcie walki zamiast od początku (blondynka z windy, krok 126). */
  readonly arrival?: DuetArrival;
}

/**
 * Wejście partnera w trakcie walki (krok 126): do progu HP gospodarza partnera nie ma na arenie; potem wychodzi
 * z windy (`enterMs`, w tym czasie nietykalny) z ułamkiem `partnerHpRatio` swojego HP — tyle, z ilu uciekła wcześniej.
 */
export interface DuetArrival {
  readonly hostHpRatio: number;
  readonly partnerHpRatio: number;
  readonly enterMs: number;
}

/** Czy partner już wchodzi: gospodarz walczy i spadł do progu HP (albo padł, zanim partner zdążył wejść). */
export function shouldPartnerArrive(
  host: { readonly hp: number; readonly maxHp: number; readonly fighting: boolean; readonly defeated: boolean },
  arrival: Pick<DuetArrival, 'hostHpRatio'>,
): boolean {
  if (host.defeated) return true;
  return host.fighting && host.maxHp > 0 && host.hp <= host.maxHp * arrival.hostHpRatio;
}

/** Obrażenia, które partner „przynosi” z poprzedniej walki: zostaje mu `partnerHpRatio` maksimum (co najmniej 1 HP). */
export function arrivalWounds(maxHp: number, arrival: Pick<DuetArrival, 'partnerHpRatio'>): number {
  return Math.max(0, maxHp - Math.max(1, Math.round(maxHp * arrival.partnerHpRatio)));
}

/** Duet na danym piętrze (w każdym kręgu wieży) albo null. */
export function duetForFloor(
  floor: number,
  duets: readonly BossDuetDefinition[],
  loop: Pick<TowerLoopConfig, 'floorsPerLoop'>,
): BossDuetDefinition | null {
  const inLoop = floorInLoop(floor, loop);
  return duets.find((duet) => duet.floorInLoop === inLoop) ?? null;
}

/** Stan jednego bossa duetu dla wspólnego paska. */
export interface DuetMember {
  readonly hp: number;
  readonly maxHp: number;
  readonly fighting: boolean;
  readonly defeated: boolean;
  readonly enraged: boolean;
  readonly enragedLabel: string;
}

/**
 * Wspólny pasek duetu: suma HP obu (pokonany liczy się jako 0, pasek nie skacze), wściekłość od pierwszego
 * wściekłego. Null, dopóki żaden nie walczy (przed walką i po zwycięstwie).
 */
export function duetStatus(members: readonly DuetMember[], text: Pick<BossDuetDefinition, 'name' | 'title'>): BossHudData | null {
  if (!members.some((m) => m.fighting)) return null;
  const enraged = members.find((m) => m.fighting && m.enraged);
  return {
    name: text.name,
    title: text.title,
    enragedLabel: enraged?.enragedLabel ?? members[0]?.enragedLabel ?? '',
    hp: members.reduce((sum, m) => sum + (m.defeated ? 0 : Math.max(0, m.hp)), 0),
    maxHp: members.reduce((sum, m) => sum + m.maxHp, 0),
    enraged: enraged !== undefined,
  };
}

/**
 * Rozepchnięcie dwóch nachodzących na siebie bossów (oba ciała są nieruchome dla fizyki, więc kolizja ich nie
 * rozdzieli): każdy cofa się o połowę zakładki wzdłuż linii środków. Zwraca przesunięcia albo null, gdy nie nachodzą.
 */
export function pushApart(a: Vector2, b: Vector2, minDistance: number): { readonly a: Vector2; readonly b: Vector2 } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= minDistance) return null;
  // Środki w jednym punkcie: rozsuwamy w poziomie.
  const [nx, ny] = distance > 0 ? [dx / distance, dy / distance] : [1, 0];
  const half = (minDistance - distance) / 2;
  return { a: { x: -nx * half, y: -ny * half }, b: { x: nx * half, y: ny * half } };
}
