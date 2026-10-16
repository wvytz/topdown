import { DIAGNOSTICS } from '@/config/diagnosticsConfig';

/**
 * Dziennik diagnostyczny (krok 55): czysta logika zapisu błędów i niespotykanych zdarzeń — ring zdarzeń z deduplikacją,
 * sesje i wykrycie nieczystego zakończenia poprzedniej sesji, monitor klatek, kontrola poprawności stanu, raport tekstowy.
 * Przeglądarka (error, localStorage, DOM) jest w `diagnostics/` i `persistence/`.
 */
export type DiagLevel = 'info' | 'warn' | 'error';
export type DiagData = Readonly<Record<string, string | number | boolean | null>>;

export interface DiagEvent {
  /** Ms od startu sesji. */
  readonly t: number;
  readonly kind: string;
  readonly level: DiagLevel;
  readonly message: string;
  readonly data?: DiagData;
  /** Ile razy to samo zdarzenie powtórzyło się w oknie deduplikacji (1 = raz). */
  readonly count: number;
}

export interface DiagBeat {
  readonly t: number;
  readonly state: DiagData;
  readonly fps: number | null;
  readonly heapMB: number | null;
}

export interface DiagSession {
  readonly id: string;
  /** Znacznik czasu startu (ms epoch). */
  readonly startedAt: number;
  readonly env: DiagData;
  readonly events: readonly DiagEvent[];
  readonly lastBeat: DiagBeat | null;
  /** true, gdy strona zdążyła zgłosić zamknięcie (pagehide/beforeunload); false = urwana (awaria, zabicie karty). */
  readonly endedCleanly: boolean;
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}…` : text);

/** Komunikat i (przycięty) stos z dowolnej wartości rzuconej przez kod. */
export function describeError(error: unknown): { readonly message: string; readonly stack?: string } {
  if (error instanceof Error) {
    return {
      message: clip(`${error.name}: ${error.message}`, DIAGNOSTICS.maxMessageLength),
      ...(error.stack ? { stack: clip(error.stack, DIAGNOSTICS.maxStackLength) } : {}),
    };
  }
  if (typeof error === 'string') return { message: clip(error, DIAGNOSTICS.maxMessageLength) };
  try {
    return { message: clip(JSON.stringify(error) ?? String(error), DIAGNOSTICS.maxMessageLength) };
  } catch {
    return { message: clip(String(error), DIAGNOSTICS.maxMessageLength) };
  }
}

/** Bieżąca sesja: zdarzenia dopisywane z deduplikacją, z ograniczoną pojemnością. */
export class DiagnosticLog {
  private events: DiagEvent[] = [];
  private beat: DiagBeat | null = null;
  private endedCleanly = false;
  private errors = 0;

  constructor(
    readonly id: string,
    readonly startedAt: number,
    readonly env: DiagData,
  ) {}

  /** Zapisuje zdarzenie; zwraca je albo null, gdy zdusiła je deduplikacja (to samo zdarzenie za często). */
  record(now: number, kind: string, level: DiagLevel, message: string, data?: DiagData): DiagEvent | null {
    const t = Math.max(0, now - this.startedAt);
    const text = clip(message, DIAGNOSTICS.maxMessageLength);
    for (let i = this.events.length - 1; i >= 0; i--) {
      const previous = this.events[i]!;
      if (t - previous.t > DIAGNOSTICS.dedupeWindowMs) break;
      if (previous.kind !== kind || previous.message !== text) continue;
      this.events[i] = { ...previous, count: previous.count + 1 };
      if (level === 'error') this.errors++;
      return previous.count + 1 <= DIAGNOSTICS.maxSameEvents ? this.events[i]! : null;
    }
    const event: DiagEvent = { t, kind, level, message: text, count: 1, ...(data ? { data } : {}) };
    this.events.push(event);
    if (this.events.length > DIAGNOSTICS.maxEvents) this.events.shift();
    if (level === 'error') this.errors++;
    return event;
  }

  heartbeat(now: number, state: DiagData, fps: number | null, heapMB: number | null): void {
    this.beat = { t: Math.max(0, now - this.startedAt), state, fps, heapMB };
  }

  markCleanEnd(): void {
    this.endedCleanly = true;
  }

  get errorCount(): number {
    return this.errors;
  }

  snapshot(): DiagSession {
    return {
      id: this.id,
      startedAt: this.startedAt,
      env: this.env,
      events: [...this.events],
      lastBeat: this.beat,
      endedCleanly: this.endedCleanly,
    };
  }
}

/** Sesja urwana bez zgłoszenia zamknięcia (twarde wyrzucenie, zabicie karty przez przeglądarkę, awaria) — poza pierwszym uruchomieniem. */
export function endedAbnormally(previous: DiagSession | null | undefined): boolean {
  return !!previous && !previous.endedCleanly;
}

/** Nowa lista sesji do zapisu: bieżąca na końcu, najstarsze wypadają; po przekroczeniu rozmiaru tniemy zdarzenia od najstarszych. */
export function trimSessions(sessions: readonly DiagSession[], maxChars: number = DIAGNOSTICS.maxStorageChars): DiagSession[] {
  let list = sessions.slice(-DIAGNOSTICS.maxSessions);
  while (JSON.stringify(list).length > maxChars) {
    const target = list.findIndex((s) => s.events.length > 0);
    if (target === -1) break;
    list = list.map((s, i) => (i === target ? { ...s, events: s.events.slice(Math.ceil(s.events.length / 2)) } : s));
  }
  return list;
}

/** Poprawna lista sesji z surowego JSON-u (uszkodzony zapis → pusta lista). */
export function parseSessions(raw: string | null): DiagSession[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (s): s is DiagSession =>
        typeof s === 'object' && s !== null && typeof (s as DiagSession).id === 'string' && Array.isArray((s as DiagSession).events),
    );
  } catch {
    return [];
  }
}

export type FrameAnomaly =
  | { readonly kind: 'stall'; readonly deltaMs: number }
  | { readonly kind: 'low-fps'; readonly fps: number };

/** Monitor klatek: zacięcia (pojedyncza długa klatka) i długotrwałe mulenie (niski średni FPS), z odstępami między zgłoszeniami. */
export class FrameMonitor {
  private windowStart = -1;
  private frames = 0;
  private lastStallAt = -Infinity;
  private lastLowFpsAt = -Infinity;

  constructor(private readonly config: typeof DIAGNOSTICS.frames = DIAGNOSTICS.frames) {}

  frame(deltaMs: number, now: number): FrameAnomaly[] {
    const out: FrameAnomaly[] = [];
    if (deltaMs >= this.config.stallMs && now - this.lastStallAt >= this.config.stallCooldownMs) {
      this.lastStallAt = now;
      out.push({ kind: 'stall', deltaMs: Math.round(deltaMs) });
    }
    // Długa klatka (karta w tle, zacięcie) nie liczy się do średniego FPS — to osobne zdarzenie.
    if (deltaMs >= this.config.stallMs) {
      this.windowStart = -1;
      return out;
    }
    if (this.windowStart < 0) {
      this.windowStart = now;
      this.frames = 0;
    }
    this.frames++;
    const elapsed = now - this.windowStart;
    if (elapsed >= this.config.lowFpsWindowMs) {
      const fps = (this.frames * 1000) / elapsed;
      if (fps < this.config.lowFps && now - this.lastLowFpsAt >= this.config.lowFpsCooldownMs) {
        this.lastLowFpsAt = now;
        out.push({ kind: 'low-fps', fps: Math.round(fps * 10) / 10 });
      }
      this.windowStart = now;
      this.frames = 0;
    }
    return out;
  }
}

/** Nieprawidłowe wartości w stanie gry (NaN, ∞, ujemne HP, pozycja poza mapą) — „niemożliwe” stany do zapisania. */
export function sanityIssues(sample: { readonly x: number; readonly y: number; readonly hp: number; readonly maxHp: number }, world: { readonly width: number; readonly height: number }): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) issues.push(`pozycja gracza nie jest liczbą (${sample.x}, ${sample.y})`);
  else if (sample.x < -64 || sample.y < -64 || sample.x > world.width + 64 || sample.y > world.height + 64) {
    issues.push(`gracz poza mapą (${Math.round(sample.x)}, ${Math.round(sample.y)})`);
  }
  if (!Number.isFinite(sample.hp) || !Number.isFinite(sample.maxHp)) issues.push(`HP nie jest liczbą (${sample.hp}/${sample.maxHp})`);
  else if (sample.hp < 0 || sample.hp > sample.maxHp + 1e-6) issues.push(`HP poza zakresem (${sample.hp}/${sample.maxHp})`);
  return issues;
}

const fmtData = (data: DiagData | undefined): string => (data ? ` ${JSON.stringify(data)}` : '');

/** Raport tekstowy do wklejenia testerowi/autorowi: ostatnie sesje, od najstarszej. */
export function formatReport(sessions: readonly DiagSession[]): string {
  const lines: string[] = ['Tower Crawler — raport diagnostyczny'];
  for (const s of sessions) {
    lines.push('', `=== Sesja ${s.id} (start ${new Date(s.startedAt).toISOString()}) — ${s.endedCleanly ? 'zamknięta normalnie' : 'URWANA (bez zamknięcia)'} ===`);
    lines.push(`Środowisko:${fmtData(s.env)}`);
    for (const e of s.events) {
      const tag = e.level === 'error' ? 'ERR ' : e.level === 'warn' ? 'WARN' : 'info';
      lines.push(`+${(e.t / 1000).toFixed(1)}s [${tag}] ${e.kind}: ${e.message}${e.count > 1 ? ` (×${e.count})` : ''}${fmtData(e.data)}`);
    }
    if (s.lastBeat) {
      lines.push(`Ostatni puls +${(s.lastBeat.t / 1000).toFixed(1)}s: fps=${s.lastBeat.fps ?? '?'} sterta=${s.lastBeat.heapMB ?? '?'}MB${fmtData(s.lastBeat.state)}`);
    }
  }
  return lines.join('\n');
}
