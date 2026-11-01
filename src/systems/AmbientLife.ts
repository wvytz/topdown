import type { GlowPropConfig, GraveyardAmbientConfig, GroveAmbientConfig } from '@/config/ambientConfig';

/**
 * Żywe otoczenie (krok 156): czyste zasady zachowania rekwizytów, które reagują na bohatera — świecące grzyby
 * i znicze (płoszenie, przygasanie, zdmuchnięcie), kruki (zryw i odlot stadem), błędne ogniki (ucieczka) i ćmy
 * (orbita, rozproszenie). Phaser tylko rysuje (`effects/AmbientLifeView.ts`). Losowość podaje wywołujący
 * (efekty czysto wizualne), więc funkcje są deterministyczne.
 */

/** Najbliższy bohater względem rekwizytu. */
export interface AmbientThreat {
  readonly x: number;
  readonly y: number;
  readonly distance: number;
  readonly dashing: boolean;
}

// ---------------- rekwizyty świecące: kępy grzybów, lampy, znicze ----------------

export enum GlowPhase {
  /** Spokój: pulsuje / migocze. */
  Calm = 'calm',
  /** Skulenie albo szarpnięcie płomienia (animacja „flinch”). */
  Flinch = 'flinch',
  /** Przygaszony, dopóki bohater stoi obok, i jeszcze `dimMs`. */
  Dim = 'dim',
  /** Powolny powrót do pełnego światła. */
  Recover = 'recover',
  /** Zgaszony na dobre (zdmuchnięty znicz albo wypalony). */
  Out = 'out',
}

export interface GlowState {
  readonly phase: GlowPhase;
  /** Początek obecnej fazy (ms czasu gry). */
  readonly since: number;
  /** Chwila ostatniego spłoszenia (ćmy się rozpraszają) — -Infinity, gdy jeszcze nie. */
  readonly startledAt: number;
  /** Czy bohater był w promieniu płoszenia w poprzednim kroku (płoszy wejście, a nie stanie obok). */
  readonly inside: boolean;
}

export type GlowEvent = 'startle' | 'snuff' | null;

export function initialGlow(lit: boolean): GlowState {
  return { phase: lit ? GlowPhase.Calm : GlowPhase.Out, since: 0, startledAt: Number.NEGATIVE_INFINITY, inside: false };
}

/**
 * Krok rekwizytu świecącego. `snuffRadius` — tylko znicze: dash bliżej niż tyle gasi je na dobre.
 * Płoszy wejście bohatera w promień (a nie samo stanie obok); przygaszony grzyb czeka, aż bohater odejdzie.
 */
export function stepGlow(
  state: GlowState,
  now: number,
  threat: AmbientThreat | null,
  config: GlowPropConfig,
  snuffRadius?: number,
): { readonly state: GlowState; readonly event: GlowEvent } {
  if (state.phase === GlowPhase.Out) return { state, event: null };
  const inside = threat !== null && threat.distance <= config.startleRadius;
  if (snuffRadius !== undefined && threat !== null && threat.dashing && threat.distance <= snuffRadius) {
    return { state: { phase: GlowPhase.Out, since: now, startledAt: now, inside }, event: 'snuff' };
  }
  const elapsed = now - state.since;
  const enters = inside && !state.inside;
  switch (state.phase) {
    case GlowPhase.Calm:
    case GlowPhase.Recover:
      if (enters) return { state: { phase: GlowPhase.Flinch, since: now, startledAt: now, inside }, event: 'startle' };
      if (state.phase === GlowPhase.Recover && elapsed >= config.recoverMs) return next(state, GlowPhase.Calm, now, inside);
      return { state: { ...state, inside }, event: null };
    case GlowPhase.Flinch:
      if (elapsed < config.flinchMs) return { state: { ...state, inside }, event: null };
      return next(state, config.dimMs > 0 ? GlowPhase.Dim : GlowPhase.Calm, now, inside);
    case GlowPhase.Dim:
      // Bohater stoi obok — grzyb dalej skulony (odlicza od nowa).
      if (inside) return { state: { ...state, since: now, inside }, event: null };
      if (elapsed < config.dimMs) return { state: { ...state, inside }, event: null };
      return next(state, config.recoverMs > 0 ? GlowPhase.Recover : GlowPhase.Calm, now, inside);
  }
}

function next(state: GlowState, phase: GlowPhase, now: number, inside: boolean): { readonly state: GlowState; readonly event: GlowEvent } {
  return { state: { ...state, phase, since: now, inside }, event: null };
}

/** Klatka pulsu/migotania (0..len-1) w rytmie `fps`, przesunięta o `offset` (każdy rekwizyt w innej fazie). */
export function pulseFrame(now: number, fps: number, offset: number, length: number): number {
  if (length <= 0) return 0;
  const frame = Math.floor((now * fps) / 1000) + offset;
  return ((frame % length) + length) % length;
}

/**
 * Promień światła rekwizytu (px): w spokoju skacze o `pulseOffsets` w rytmie klatek (pixel art — bez płynnego
 * falowania), przy skuleniu spada w pół drogi do `dimRadius`, przygaszony świeci `dimRadius`, wraca schodkami
 * co 2 px. Zgaszony — 0.
 */
export function glowLightRadius(state: GlowState, now: number, config: GlowPropConfig, frame: number): number {
  const full = config.lightRadius + (config.pulseOffsets[frame % Math.max(1, config.pulseOffsets.length)] ?? 0);
  switch (state.phase) {
    case GlowPhase.Calm:
      return full;
    case GlowPhase.Flinch:
      return Math.round((config.lightRadius + config.dimRadius) / 2);
    case GlowPhase.Dim:
      return config.dimRadius;
    case GlowPhase.Recover: {
      const progress = Math.min(1, Math.max(0, (now - state.since) / Math.max(1, config.recoverMs)));
      const radius = config.dimRadius + (config.lightRadius - config.dimRadius) * progress;
      return Math.floor(radius / 2) * 2;
    }
    case GlowPhase.Out:
      return 0;
  }
}

// ---------------- ćmy wokół kęp i lamp ----------------

/** Rozproszenie ćm 0..1: pełne zaraz po spłoszeniu, potem maleje przez `recoverMs`. */
export function mothScatter(state: GlowState, now: number, moths: GroveAmbientConfig['moths']): number {
  const since = now - state.startledAt;
  if (!Number.isFinite(since) || since < 0) return 0;
  return Math.max(0, 1 - since / Math.max(1, moths.recoverMs));
}

/**
 * Pozycja ćmy względem rekwizytu (px): spłaszczona orbita (rzut z góry), każda ćma z inną prędkością i fazą,
 * lekkie podskoki; rozproszone — orbita `scatterScale` razy większa.
 */
export function mothOffset(
  timeMs: number,
  index: number,
  count: number,
  moths: GroveAmbientConfig['moths'],
  scatter: number,
): { readonly x: number; readonly y: number } {
  const t = timeMs / 1000;
  const speed = moths.orbitSpeed * (1 + 0.17 * index) * (index % 2 === 0 ? 1 : -1);
  const angle = t * speed + (2 * Math.PI * index) / Math.max(1, count);
  const radius = moths.orbitRadius * (1 + (moths.scatterScale - 1) * Math.min(1, Math.max(0, scatter))) * (1 + 0.18 * Math.sin(t * 3.1 + index));
  return {
    x: Math.cos(angle) * radius,
    // Orbita spłaszczona (widok z góry) i uniesiona nad kępę; ćma podskakuje.
    y: Math.sin(angle) * radius * 0.55 - 6 + Math.sin(t * 7.3 + index * 1.7) * 1.5,
  };
}

// ---------------- kruki ----------------

export enum RavenPhase {
  Perched = 'perched',
  Flying = 'flying',
  Gone = 'gone',
}

export interface RavenState {
  readonly phase: RavenPhase;
  readonly x: number;
  readonly y: number;
  /** Wysokość lotu nad cieniem (px). */
  readonly height: number;
  /** Kierunek lotu (wektor jednostkowy). */
  readonly dirX: number;
  readonly dirY: number;
  readonly since: number;
  /** Zaplanowany zryw (stado) — Infinity, gdy brak; z kierunkiem ucieczki od `alarmFrom`. */
  readonly alarmAt: number;
  readonly alarmFrom: { readonly x: number; readonly y: number } | null;
}

export function initialRaven(x: number, y: number): RavenState {
  return { phase: RavenPhase.Perched, x, y, height: 0, dirX: 1, dirY: 0, since: 0, alarmAt: Number.POSITIVE_INFINITY, alarmFrom: null };
}

/** Sąsiad spłoszonego kruka zrywa się chwilę później (wcześniejszy alarm wygrywa). */
export function alarmRaven(state: RavenState, at: number, from: { readonly x: number; readonly y: number }): RavenState {
  if (state.phase !== RavenPhase.Perched || at >= state.alarmAt) return state;
  return { ...state, alarmAt: at, alarmFrom: from };
}

/**
 * Krok kruka: siedzi, dopóki bohater nie podejdzie (w dashu płoszy z dalszej odległości) albo nie przyjdzie
 * alarm stada; wtedy zrywa się od bohatera (± `jitter` rad), przyspiesza i wznosi, a po `flightMs` znika.
 */
export function stepRaven(
  state: RavenState,
  now: number,
  dtMs: number,
  threat: AmbientThreat | null,
  config: GraveyardAmbientConfig['ravens'],
  jitter = 0,
): { readonly state: RavenState; readonly event: 'takeoff' | null } {
  if (state.phase === RavenPhase.Gone) return { state, event: null };
  if (state.phase === RavenPhase.Perched) {
    const radius = threat?.dashing ? config.dashFleeRadius : config.fleeRadius;
    const scared = threat !== null && threat.distance <= radius;
    if (!scared && now < state.alarmAt) return { state, event: null };
    const from = scared && threat ? threat : (state.alarmFrom ?? { x: state.x - 1, y: state.y });
    const base = Math.atan2(state.y - from.y, state.x - from.x) || 0;
    const angle = base + jitter;
    return {
      state: { ...state, phase: RavenPhase.Flying, dirX: Math.cos(angle), dirY: Math.sin(angle), since: now, alarmAt: Number.POSITIVE_INFINITY },
      event: 'takeoff',
    };
  }
  const t = (now - state.since) / Math.max(1, config.flightMs);
  if (t >= 1) return { state: { ...state, phase: RavenPhase.Gone }, event: null };
  const speed = config.takeoffSpeed + (config.cruiseSpeed - config.takeoffSpeed) * Math.min(1, t * 2);
  const dt = dtMs / 1000;
  return {
    state: { ...state, x: state.x + state.dirX * speed * dt, y: state.y + state.dirY * speed * dt, height: state.height + config.climbSpeed * dt },
    event: null,
  };
}

// ---------------- błędne ogniki ----------------

export interface WispState {
  /** Środek kołysania (px świata) — przesuwa się, gdy ognik ucieka. */
  readonly homeX: number;
  readonly homeY: number;
  readonly swayRadius: number;
  /** Faza kołysania (każdy ognik inna). */
  readonly phase: number;
}

export interface PixelBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Pozycja ognika: pętla w kształcie ósemki wokół domu (spokojne snucie się). */
export function wispPosition(state: WispState, timeMs: number, config: GraveyardAmbientConfig['wisps']): { readonly x: number; readonly y: number } {
  const a = (timeMs / 1000) * config.swaySpeed + state.phase;
  return { x: state.homeX + Math.cos(a) * state.swayRadius, y: state.homeY + Math.sin(2 * a) * state.swayRadius * 0.5 };
}

/**
 * Krok ognika: bohater bliżej niż `fleeRadius` od obecnej pozycji — dom ucieka od niego z `fleeSpeed`, ale zostaje
 * w pokoju (`bounds` zwężone o `wallMarginPx`), więc osaczony ognik sunie wzdłuż muru.
 */
export function stepWisp(
  state: WispState,
  timeMs: number,
  dtMs: number,
  threat: { readonly x: number; readonly y: number } | null,
  bounds: PixelBounds,
  config: GraveyardAmbientConfig['wisps'],
): WispState {
  if (!threat) return state;
  const at = wispPosition(state, timeMs, config);
  const dx = at.x - threat.x;
  const dy = at.y - threat.y;
  const distance = Math.hypot(dx, dy);
  if (distance > config.fleeRadius) return state;
  const len = distance > 0.001 ? distance : 1;
  const step = (config.fleeSpeed * dtMs) / 1000;
  const m = config.wallMarginPx + state.swayRadius;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return {
    ...state,
    homeX: clamp(state.homeX + (distance > 0.001 ? dx / len : 1) * step, bounds.left + m, bounds.right - m),
    homeY: clamp(state.homeY + (distance > 0.001 ? dy / len : 0) * step, bounds.top + m, bounds.bottom - m),
  };
}
