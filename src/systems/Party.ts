import type { Vector2 } from '@/core/types';

/**
 * Drużyna bohaterów (co-op, etap C0): zasady wspólne dla jednego i dwóch graczy, bez Phasera.
 * Gra solo to drużyna z jednym członkiem — wtedy każda funkcja zwraca to samo, co dawne odwołanie do gracza.
 */
export interface PartyMember extends Vector2 {
  readonly isDead: boolean;
}

/** Żywi członkowie drużyny w kolejności graczy (P1, P2). */
export function livingMembers<T extends PartyMember>(members: readonly T[]): T[] {
  return members.filter((member) => !member.isDead);
}

/** Cała drużyna leży — koniec runu. */
export function isPartyDown(members: readonly PartyMember[]): boolean {
  return members.every((member) => member.isDead);
}

/** Najbliższy żywy członek drużyny; remis rozstrzyga kolejność graczy. Nikt nie żyje — null. */
export function nearestLivingMember<T extends PartyMember>(members: readonly T[], from: Vector2): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const member of members) {
    if (member.isDead) continue;
    const d = Math.hypot(member.x - from.x, member.y - from.y);
    if (d < bestDistance) {
      best = member;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Bohater, w którego celuje wróg z punktu `from`: najbliższy żywy, a gdy nikt nie żyje — pierwszy gracz
 * (wrogowie patrzą wtedy na jego ciało, jak dotąd w grze solo).
 */
export function targetMember<T extends PartyMember>(members: readonly T[], from: Vector2): T {
  const first = members[0];
  if (!first) throw new Error('Drużyna bez bohaterów');
  return nearestLivingMember(members, from) ?? first;
}

/**
 * Bohaterowie do ściągnięcia do zamykanego pokoju (co-op, etap C3): każdy poza kotwicą, kto stoi poza
 * pokojem — także powalony, żeby partner mógł go wskrzesić za kratami.
 */
export function straysOutside<T extends Vector2>(members: readonly T[], anchor: T, isInside: (at: Vector2) => boolean): T[] {
  return members.filter((member) => member !== anchor && !isInside(member));
}

/** Miejsce obok kotwicy: w bok, potem w pionie; gdy wszędzie mur — na samej kotwicy. */
export function spotBeside(anchor: Vector2, offsetPx: number, isWalkable: (at: Vector2) => boolean): Vector2 {
  const spots = [
    { x: anchor.x + offsetPx, y: anchor.y },
    { x: anchor.x - offsetPx, y: anchor.y },
    { x: anchor.x, y: anchor.y + offsetPx },
    { x: anchor.x, y: anchor.y - offsetPx },
  ];
  return spots.find(isWalkable) ?? { x: anchor.x, y: anchor.y };
}
