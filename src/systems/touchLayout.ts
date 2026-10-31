/**
 * Układ sterowania dotykowego na ekranie telefonu (krok 141) — czysta geometria.
 * Przyciski walki i gałka ruchu żyją w pikselach CSS ekranu, nie płótna: płótno 16:9 na szerokim telefonie
 * zostawia po bokach czarne pasy, a kciuki leżą przy krawędziach ekranu — tam teraz są przyciski.
 * Rozmiar w pikselach CSS to też stały rozmiar pod kciukiem, niezależny od skali płótna.
 */
import type { Vector2 } from '@/core/types';

/** Okrągły przycisk: środek liczony od prawego dolnego rogu ekranu i promień (piksele CSS). */
export interface CornerButtonSpec {
  readonly right: number;
  readonly bottom: number;
  readonly radius: number;
}

/** Przycisk na ekranie: środek i promień w pikselach CSS. */
export interface ScreenButton {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

/** Środek przycisku na ekranie danego rozmiaru. */
export function placeButton(spec: CornerButtonSpec, screen: ScreenSize): ScreenButton {
  return { x: screen.width - spec.right, y: screen.height - spec.bottom, radius: spec.radius };
}

/**
 * Przycisk pod kciukiem: strefa dotyku to promień × `hitSlop`; przy nakładających się strefach wygrywa
 * najbliższy środek. Pomijane są przyciski, których `enabled` nie przepuszcza (np. E, gdy nic nie zrobi).
 */
export function buttonAt<Id extends string>(
  buttons: Readonly<Record<Id, ScreenButton>>,
  point: Vector2,
  hitSlop: number,
  enabled: (id: Id) => boolean = () => true,
): Id | null {
  let best: Id | null = null;
  let bestDistance = Infinity;
  for (const id of Object.keys(buttons) as Id[]) {
    if (!enabled(id)) continue;
    const button = buttons[id];
    const distance = Math.hypot(point.x - button.x, point.y - button.y);
    if (distance <= button.radius * hitSlop && distance < bestDistance) {
      best = id;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Gałka ruchu podąża za kciukiem: gdy kciuk wyjedzie poza promień, środek gałki przesuwa się za nim
 * (zostaje w odległości promienia). Zawrócenie nie wymaga wtedy cofania kciuka przez cały dawny środek —
 * kierunek zmienia się od razu, jak w grach zręcznościowych na telefon.
 */
export function followStickOrigin(origin: Vector2, thumb: Vector2, radius: number): Vector2 {
  const dx = thumb.x - origin.x;
  const dy = thumb.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length <= radius) return origin;
  const excess = (length - radius) / length;
  return { x: origin.x + dx * excess, y: origin.y + dy * excess };
}
