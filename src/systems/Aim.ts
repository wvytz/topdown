/**
 * Celowanie bez myszy (krok 49): kierunek z klawiatury i gałki dotykowej oraz wspomaganie celowania.
 * Czysta matematyka — InputController i GameScene tylko podają dane i wykonują wynik.
 */
import type { AimAssistConfig } from '@/config/inputConfig';
import type { MovementIntent, Vector2 } from '@/core/types';
import { normalize, wrapAngle } from '@/systems/CombatMath';

/** Wychylenie gałki: kierunek (wektor jednostkowy albo zero) i siła 0–1 po odjęciu martwej strefy. */
export interface StickState {
  readonly direction: Vector2;
  readonly strength: number;
}

const IDLE_STICK: StickState = { direction: { x: 0, y: 0 }, strength: 0 };

/**
 * Gałka: przesunięcie kciuka od środka (dx, dy) przy promieniu `radius`.
 * W martwej strefie (ułamek promienia) — zero; dalej siła rośnie liniowo do 1 na brzegu.
 */
export function stickState(dx: number, dy: number, radius: number, deadzone: number): StickState {
  const length = Math.hypot(dx, dy);
  if (radius <= 0 || length <= radius * deadzone) return IDLE_STICK;
  const strength = Math.min(1, (length / radius - deadzone) / (1 - deadzone));
  return { direction: { x: dx / length, y: dy / length }, strength };
}

/** Gałka ruchu → intencja ruchu (długość ≤ 1; MovementSystem i tak normalizuje kierunek). */
export function stickToMovement(stick: StickState): MovementIntent {
  return stick.strength > 0 ? stick.direction : { x: 0, y: 0 };
}

/**
 * Sama klawiatura: celujemy tam, dokąd idziemy (8 kierunków). Blokada kierunku (przytrzymany klawisz)
 * albo postój zostawiają poprzedni kierunek — można iść bokiem lub cofać się i atakować do przodu.
 */
export function keyboardAimDirection(move: MovementIntent, locked: boolean, previous: Vector2): Vector2 {
  if (locked || (move.x === 0 && move.y === 0)) return previous;
  return normalize(move);
}

/** Cel wspomagania: środek i promień (duży boss łapie się szybciej niż mały pająk). */
export interface AimTarget {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Wspomaganie celowania: jeśli w stożku wokół `direction` (z zapasem na promień celu) jest cel w zasięgu,
 * kierunek dociąga do środka tego, który leży najbliżej osi celowania. Bez celu kierunek się nie zmienia —
 * gracz zawsze sam wybiera stronę, wspomaganie tylko poprawia niedokładność urządzenia.
 */
export function assistAimDirection(
  origin: Vector2,
  direction: Vector2,
  targets: Iterable<AimTarget>,
  config: AimAssistConfig,
): Vector2 {
  if (config.coneHalfDeg <= 0 || config.range <= 0 || (direction.x === 0 && direction.y === 0)) return direction;
  const aimAngle = Math.atan2(direction.y, direction.x);
  const cone = (config.coneHalfDeg * Math.PI) / 180;
  let best: Vector2 | null = null;
  let bestOffset = Infinity;
  for (const target of targets) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || dist > config.range) continue;
    const offset = Math.abs(wrapAngle(Math.atan2(dy, dx) - aimAngle));
    // Połowa kąta, pod jakim widać cel z miejsca gracza.
    const halfSize = Math.asin(Math.min(1, target.radius / dist));
    if (offset - halfSize > cone || offset >= bestOffset) continue;
    best = { x: dx / dist, y: dy / dist };
    bestOffset = offset;
  }
  return best ?? direction;
}

/**
 * Dotyk (krok 49b): kierunek celowania z gałek. Pierwszeństwo ma gałka strzału (przycisk STRZAŁ/PROMIEŃ
 * przeciągnięty w stronę celu — natychmiastowy obrót i salwa jednym kciukiem), potem gałka ataku,
 * a bez nich — kierunek ruchu albo poprzedni kierunek.
 */
export function touchAimDirection(shot: Vector2 | null, attack: Vector2 | null, move: MovementIntent, previous: Vector2): Vector2 {
  return shot ?? attack ?? keyboardAimDirection(move, false, previous);
}

/**
 * Automatyczne celowanie po stuknięciu (krok 49c, jak w Brawl Stars): kierunek do najbliższego celu
 * w zasięgu; null, gdy nikogo nie ma — wtedy atak leci w bieżącym kierunku.
 */
export function autoAimDirection(origin: Vector2, targets: Iterable<AimTarget>, range: number): Vector2 | null {
  let best: Vector2 | null = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    // Liczy się brzeg celu: duży boss obok jest „bliżej” niż mały pająk tuż za nim.
    const edge = Math.hypot(dx, dy) - target.radius;
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || edge > range || edge >= bestDistance) continue;
    best = { x: dx / dist, y: dy / dist };
    bestDistance = edge;
  }
  return best;
}
