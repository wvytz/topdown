import type { Vector2 } from '@/core/types';

/**
 * Wskaźnik celu poza kadrem (krok 136): boss w dalekim rogu areny dostaje strzałkę przy krawędzi ekranu.
 * Czysta geometria w pikselach ekranu — scena przelicza pozycję bossa, HUD rysuje.
 */
export interface EdgePointer {
  /** Punkt przy krawędzi ekranu (odsunięty o margines), na linii od środka ekranu do celu. */
  readonly x: number;
  readonly y: number;
  /** Kierunek do celu (radiany, jak `Math.atan2`). */
  readonly angle: number;
}

/**
 * Wskaźnik dla celu w punkcie `target` ekranu `width × height` albo null, gdy cel jest w kadrze
 * (jego środek co najmniej `visibleInsetPx` od krawędzi — boss wciśnięty w sam brzeg i tak dostaje strzałkę).
 */
export function edgePointer(
  target: Vector2,
  width: number,
  height: number,
  marginPx: number,
  visibleInsetPx: number,
): EdgePointer | null {
  const inside =
    target.x >= visibleInsetPx &&
    target.x <= width - visibleInsetPx &&
    target.y >= visibleInsetPx &&
    target.y <= height - visibleInsetPx;
  if (inside) return null;
  const cx = width / 2;
  const cy = height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const halfW = Math.max(0, cx - marginPx);
  const halfH = Math.max(0, cy - marginPx);
  // Promień od środka ekranu tnie wewnętrzny prostokąt na tej krawędzi, do której dochodzi pierwszy.
  const scale = Math.min(dx !== 0 ? halfW / Math.abs(dx) : Infinity, dy !== 0 ? halfH / Math.abs(dy) : Infinity);
  return { x: cx + dx * scale, y: cy + dy * scale, angle: Math.atan2(dy, dx) };
}
