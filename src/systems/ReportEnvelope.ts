import type { InputRecording } from '@/core/diagnosticsTypes';
import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import type { DiagSession } from '@/systems/Diagnostics';

/**
 * Koperta zgłoszenia diagnostycznego (krok 57) — kontrakt z workerem (`worker/src/reports.js`, wersja 1):
 * rodzaj, wersja gry, anonimowy identyfikator przeglądarki i sesji, krótkie podsumowanie do filtrowania w bazie,
 * raport tekstowy i opcjonalne załączniki (np. nagranie wejść). Czysta logika: składanie i przycinanie do limitów.
 */
export type ReportKind = 'diagnostic' | 'crash' | 'feedback';

export interface ReportAttachment {
  readonly name: string;
  readonly type: 'input-recording' | 'json' | 'text';
  readonly data: string;
}

export interface ReportEnvelope {
  readonly v: number;
  readonly kind: ReportKind;
  readonly app: { readonly build: string };
  readonly client: { readonly id: string; readonly sessionId: string };
  readonly summary: {
    readonly errors: number;
    readonly warnings: number;
    readonly floor?: number;
    readonly hero?: string;
    readonly seed?: number;
    readonly abnormalPrev: boolean;
  };
  readonly text: string;
  readonly attachments?: readonly ReportAttachment[];
}

export interface EnvelopeInput {
  readonly kind: ReportKind;
  readonly build: string;
  readonly clientId: string;
  /** Sesje z dziennika; ostatnia to bieżąca. */
  readonly sessions: readonly DiagSession[];
  readonly reportText: string;
  readonly recording?: InputRecording | null;
}

const limits = DIAGNOSTICS.reports;

/** Tekst przycięty do limitu: zostaje początek (środowisko, starsze zdarzenia) i koniec (najświeższe, najważniejsze). */
export function clipReportText(text: string, max: number = limits.maxTextChars): string {
  if (text.length <= max) return text;
  const marker = '\n…[pominięto środek raportu — za długi]…\n';
  const head = Math.floor((max - marker.length) * 0.25);
  const tail = max - marker.length - head;
  return text.slice(0, head) + marker + text.slice(text.length - tail);
}

const safeId = (value: string, max: number): string => value.replace(/[^A-Za-z0-9-]/g, '').slice(0, max) || 'x';
const safeWord = (value: string): string => value.replace(/[^\w-]/g, '').slice(0, 24);

/** Składa kopertę: podsumowanie z bieżącej sesji (błędy, ostatni stan gry), tekst i nagranie w limitach workera. */
export function buildEnvelope(input: EnvelopeInput): ReportEnvelope {
  const current = input.sessions[input.sessions.length - 1];
  const previous = input.sessions[input.sessions.length - 2];
  const state = current?.lastBeat?.state ?? {};
  const count = (level: 'error' | 'warn') => (current?.events ?? []).reduce((n, e) => (e.level === level ? n + e.count : n), 0);
  const floor = typeof state.floor === 'number' && Number.isInteger(state.floor) && state.floor >= 1 && state.floor <= 100 ? state.floor : undefined;
  const seed = typeof state.seed === 'number' && Number.isInteger(state.seed) && state.seed >= 0 && state.seed <= 4_294_967_295 ? state.seed : undefined;
  const hero = typeof state.hero === 'string' && safeWord(state.hero) !== '' ? safeWord(state.hero) : undefined;

  const text = clipReportText(input.reportText);
  const attachments: ReportAttachment[] = [];
  if (input.recording) {
    const json = JSON.stringify(input.recording);
    // Zbyt duże nagranie pomijamy w całości (obcięty JSON byłby bezużyteczny); w raporcie jest jego opis.
    if (json.length <= limits.maxAttachmentChars && text.length + json.length <= limits.maxBodyChars) {
      attachments.push({ name: `input-floor${input.recording.meta.floor}.json`, type: 'input-recording', data: json });
    }
  }
  return {
    v: limits.version,
    kind: input.kind,
    app: { build: input.build.replace(/[^\w.+\- ]/g, '').slice(0, 40) },
    client: { id: safeId(input.clientId, 64), sessionId: safeId(current?.id ?? 'unknown', 40) },
    summary: {
      errors: count('error'),
      warnings: count('warn'),
      ...(floor !== undefined ? { floor } : {}),
      ...(hero !== undefined ? { hero } : {}),
      ...(seed !== undefined ? { seed } : {}),
      abnormalPrev: previous !== undefined && !previous.endedCleanly,
    },
    text,
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

export type SendResult =
  | { readonly ok: true; readonly id?: number; readonly duplicate?: boolean }
  | { readonly ok: false; readonly reason: 'throttled' | 'rate-limited' | 'too-large' | 'rejected' | 'network' | 'unavailable'; readonly retryAfterS?: number };

/** Ograniczenie wysyłek po stronie gry: odstęp i limit na sesję (niezależnie od limitów workera). */
export class SendThrottle {
  private sent = 0;
  private lastAt = -Infinity;

  constructor(private readonly config: { readonly minIntervalMs: number; readonly maxPerSession: number } = limits) {}

  /** null = można wysłać; inaczej ms do odblokowania (Infinity = limit sesji wyczerpany). */
  waitMs(now: number): number | null {
    if (this.sent >= this.config.maxPerSession) return Infinity;
    const wait = this.lastAt + this.config.minIntervalMs - now;
    return wait > 0 ? wait : null;
  }

  record(now: number): void {
    this.sent++;
    this.lastAt = now;
  }
}
