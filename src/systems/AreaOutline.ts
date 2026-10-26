import type { Vector2 } from '@/core/types';

export interface OutlineCircle {
  readonly center: Vector2;
  readonly radius: number;
}

/** Łuk brzegu koła w radianach (od `start` do `end`, rosnąco). */
export interface OutlineArc {
  readonly start: number;
  readonly end: number;
}

/**
 * Łuki brzegu `circle`, których nie przykrywa żadne inne koło grupy (krok 110). Strefy bossa z jednego ataku
 * (hak Kata, smuga dymu Barona) to łańcuch nachodzących kół — rysujemy obrys ich sumy, bez kresek w środku.
 * Brzeg dzielimy na `segments` równych kawałków; kawałek jest widoczny, gdy jego środek leży poza innymi kołami.
 * Sąsiednie widoczne kawałki łączymy w jeden łuk; całe koło bez sąsiadów to jeden łuk 0..2π.
 */
export function exposedArcs(circle: OutlineCircle, group: readonly OutlineCircle[], segments = 48): OutlineArc[] {
  // Samo koło (także jego kopia o tym samym środku i promieniu) nie zasłania własnego brzegu.
  const same = (other: OutlineCircle): boolean =>
    other.radius === circle.radius && other.center.x === circle.center.x && other.center.y === circle.center.y;
  const others = group.filter((other) => !same(other));
  const step = (Math.PI * 2) / segments;
  const visible = Array.from({ length: segments }, (_, i) => {
    const angle = (i + 0.5) * step;
    const point = { x: circle.center.x + Math.cos(angle) * circle.radius, y: circle.center.y + Math.sin(angle) * circle.radius };
    return !others.some((other) => Math.hypot(point.x - other.center.x, point.y - other.center.y) < other.radius);
  });
  if (visible.every(Boolean)) return [{ start: 0, end: Math.PI * 2 }];
  // Zaczynamy od kawałka niewidocznego, żeby łuk przechodzący przez kąt 0 nie rozpadł się na dwa.
  const first = visible.indexOf(false);
  const arcs: OutlineArc[] = [];
  let open: number | null = null;
  for (let k = 1; k <= segments; k++) {
    const i = (first + k) % segments;
    const index = first + k;
    if (visible[i] && open === null) open = index;
    if (!visible[i] && open !== null) {
      arcs.push({ start: open * step, end: index * step });
      open = null;
    }
  }
  return arcs;
}
