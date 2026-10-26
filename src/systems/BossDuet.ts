import type { BossHudData, Vector2 } from '@/core/types';
import type { TowerLoopConfig } from '@/systems/TowerLoop';
import { floorInLoop } from '@/systems/TowerLoop';

/**
 * Duet bossów (krok 112, pomysł właściciela): na wybranej arenie walczą naraz dwaj bossowie — gospodarz areny
 * i partner z innego piętra kręgu (np. Król Pająków z Matką Pająków). Utrudnienie, na razie tylko w arenach.
 * Czysta logika: który duet na którym piętrze i wspólny pasek HP.
 */
export interface BossDuetDefinition {
  /** Piętro w kręgu, którego arena dostaje duet (gospodarz = boss tego piętra). */
  readonly floorInLoop: number;
  /** Piętro w kręgu, z którego przychodzi partner (jego definicja, skalowana do bieżącego piętra). */
  readonly partnerFloorInLoop: number;
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
