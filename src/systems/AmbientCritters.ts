import type { DenAmbientConfig, ScuttlerConfig } from '@/config/ambientConfig';
import type { AmbientThreat, PixelBounds } from '@/systems/AmbientLife';

/**
 * Żywe otoczenie wyższych pięter (krok 157): czyste zasady biegających drobiazgów (żużlowe chrząszcze, karaluchy)
 * i kopniętych puszek. Phaser tylko rysuje (`effects/AmbientCritterView.ts`). Losowość (rozrzut kierunku) podaje
 * wywołujący — efekty czysto wizualne, więc funkcje są deterministyczne.
 */

// ---------------- chrząszcze i karaluchy ----------------

export enum ScuttlePhase {
  Idle = 'idle',
  Run = 'run',
  /** Schował się w szparze pod murem (karaluch) — znika na dobre. */
  Hidden = 'hidden',
}

export interface ScuttlerState {
  readonly phase: ScuttlePhase;
  readonly x: number;
  readonly y: number;
  /** Kierunek biegu (wektor jednostkowy) — także zwrot rysunku. */
  readonly dirX: number;
  readonly dirY: number;
  readonly since: number;
}

export function initialScuttler(x: number, y: number, dirX = 1, dirY = 0): ScuttlerState {
  return { phase: ScuttlePhase.Idle, x, y, dirX, dirY, since: 0 };
}

/**
 * Krok stworka: stoi, dopóki bohater nie podejdzie (w dashu płoszy z dalszej odległości); wtedy biegnie od niego
 * (± `jitter` rad) przez `runMs`. Przy murze karaluch chowa się w szparze, a chrząszcz odbija się od niego i biegnie
 * dalej wzdłuż. Po biegu przystaje i znów można go spłoszyć.
 */
export function stepScuttler(
  state: ScuttlerState,
  now: number,
  dtMs: number,
  threat: AmbientThreat | null,
  bounds: PixelBounds,
  config: ScuttlerConfig,
  jitter = 0,
): { readonly state: ScuttlerState; readonly event: 'scatter' | 'hide' | null } {
  if (state.phase === ScuttlePhase.Hidden) return { state, event: null };
  const radius = threat?.dashing ? config.dashFleeRadius : config.fleeRadius;
  const scared = threat !== null && threat.distance <= radius;
  if (state.phase === ScuttlePhase.Idle) {
    if (!scared || !threat) return { state, event: null };
    const base = Math.atan2(state.y - threat.y, state.x - threat.x) || 0;
    const angle = base + jitter;
    return { state: { ...state, phase: ScuttlePhase.Run, dirX: Math.cos(angle), dirY: Math.sin(angle), since: now }, event: 'scatter' };
  }
  // Bieg: bohater dalej depcze po piętach — bieg się przedłuża.
  const since = scared ? now : state.since;
  if (now - since >= config.runMs) return { state: { ...state, phase: ScuttlePhase.Idle, since: now }, event: null };
  const step = (config.runSpeed * dtMs) / 1000;
  let x = state.x + state.dirX * step;
  let y = state.y + state.dirY * step;
  let dirX = state.dirX;
  let dirY = state.dirY;
  const m = config.wallMarginPx;
  const hitX = x < bounds.left + m || x > bounds.right - m;
  const hitY = y < bounds.top + m || y > bounds.bottom - m;
  if (hitX || hitY) {
    if (config.hidesAtWall) return { state: { ...state, phase: ScuttlePhase.Hidden, x, y, since: now }, event: 'hide' };
    if (hitX) dirX = -dirX;
    if (hitY) dirY = -dirY;
    x = clamp(x, bounds.left + m, bounds.right - m);
    y = clamp(y, bounds.top + m, bounds.bottom - m);
  }
  return { state: { ...state, x, y, dirX, dirY, since }, event: null };
}

// ---------------- puszki ----------------

export interface CanState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  /** Przebyta droga (px) — z niej klatka toczenia. */
  readonly rolled: number;
  /** Czy bohater był w promieniu kopnięcia w poprzednim kroku (kopie wejście, nie stanie obok). */
  readonly inside: boolean;
}

export type CanEvent = 'kick' | 'clink' | null;

export function initialCan(x: number, y: number): CanState {
  return { x, y, vx: 0, vy: 0, rolled: 0, inside: false };
}

export function canSpeed(state: CanState): number {
  return Math.hypot(state.vx, state.vy);
}

/**
 * Krok puszki: wejście bohatera w promień kopie ją od niego (w dashu mocniej), potem toczy się z wykładniczym
 * hamowaniem i odbija od murów (`solid` — czy punkt świata to ściana) z utratą prędkości. Głośne odbicie — `clink`.
 */
export function stepCan(
  state: CanState,
  dtMs: number,
  threat: AmbientThreat | null,
  solid: (x: number, y: number) => boolean,
  config: DenAmbientConfig['cans'],
): { readonly state: CanState; readonly event: CanEvent } {
  const inside = threat !== null && threat.distance <= config.kickRadius;
  let { vx, vy } = state;
  let event: CanEvent = null;
  if (inside && !state.inside && threat) {
    const dx = state.x - threat.x;
    const dy = state.y - threat.y;
    const len = Math.hypot(dx, dy);
    const speed = threat.dashing ? config.dashKick : config.walkKick;
    vx = len > 0.001 ? (dx / len) * speed : speed;
    vy = len > 0.001 ? (dy / len) * speed : 0;
    event = 'kick';
  }
  if (Math.hypot(vx, vy) < config.stopSpeed) return { state: { ...state, vx: 0, vy: 0, inside }, event };
  const dt = dtMs / 1000;
  let x = state.x + vx * dt;
  let y = state.y;
  if (solid(x, y)) {
    if (event === null && Math.abs(vx) >= config.clinkSpeed) event = 'clink';
    x = state.x;
    vx = -vx * config.bounce;
  }
  y = state.y + vy * dt;
  if (solid(x, y)) {
    if (event === null && Math.abs(vy) >= config.clinkSpeed) event = 'clink';
    y = state.y;
    vy = -vy * config.bounce;
  }
  const decay = Math.exp(-config.friction * dt);
  const rolled = state.rolled + Math.hypot(x - state.x, y - state.y);
  return { state: { x, y, vx: vx * decay, vy: vy * decay, rolled, inside }, event };
}

function clamp(v: number, lo: number, hi: number): number {
  return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
}
