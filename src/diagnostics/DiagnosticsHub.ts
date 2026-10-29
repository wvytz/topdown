import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import type { InputRecording, RecordingMeta } from '@/core/diagnosticsTypes';
import { DiagnosticStorage } from '@/persistence/DiagnosticStorage';
import { InputRecordingStorage } from '@/persistence/InputRecordingStorage';
import type { ReportSink } from '@/persistence/remoteReports';
import type { InputSample } from '@/systems/InputRecorder';
import { InputRecorder } from '@/systems/InputRecorder';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import type { DiagData, DiagLevel, DiagSession } from '@/systems/Diagnostics';
import type { ReportKind, SendResult } from '@/systems/ReportEnvelope';
import { SendThrottle, buildEnvelope } from '@/systems/ReportEnvelope';
import { DiagnosticLog, describeError, endedAbnormally, formatReport } from '@/systems/Diagnostics';
import { FEEDBACK_CONFIG } from '@/config/feedbackConfig';
import { buildFeedbackText, normalizeFeedback } from '@/systems/Feedback';

type StateProvider = () => DiagData;
type Listener = (kind: string, level: DiagLevel, message: string) => void;

/**
 * Centralny dziennik diagnostyczny (krok 55): jedno miejsce, do którego trafiają błędy, niespotykane zdarzenia
 * i okruchy (breadcrumbs) z gry. Zapisuje się w localStorage na bieżąco, więc po twardym wyrzuceniu karty
 * następna sesja widzi, co działo się przed urwaniem. Nigdy nie rzuca wyjątków — dziennik nie może psuć gry.
 */
export class DiagnosticsHub {
  private readonly storage: DiagnosticStorage;
  private readonly log: DiagnosticLog;
  private readonly previous: DiagSession[];
  private provider: StateProvider | null = null;
  private readonly listeners: Listener[] = [];
  private readonly clock: () => number;
  private readonly recorder = new InputRecorder();
  private recordings: InputRecording[];
  private reporting: { readonly sink: ReportSink; readonly clientId: string; readonly build: string } | null = null;
  private readonly throttle = new SendThrottle();
  /** Czat „Napisz do autora” (krok 133) ma własny, luźniejszy limit — krótkie wiadomości, nie raporty. */
  private readonly feedbackThrottle = new SendThrottle(FEEDBACK_CONFIG);
  private playerName: () => string | null = () => null;
  private platform = 'pc';

  constructor(
    storage: DiagnosticStorage,
    env: DiagData,
    clock: () => number = () => Date.now(),
    private readonly inputStorage: InputRecordingStorage = new InputRecordingStorage(null),
  ) {
    this.storage = storage;
    this.recordings = inputStorage.load();
    this.clock = clock;
    this.previous = storage.load();
    const startedAt = clock();
    this.log = new DiagnosticLog(`${startedAt.toString(36)}`, startedAt, env);
    const last = this.previous[this.previous.length - 1];
    if (endedAbnormally(last)) {
      this.note('previous-session-ended-abnormally', {
        previous: last?.id ?? null,
        lastBeatS: last?.lastBeat ? Math.round(last.lastBeat.t / 1000) : null,
        ...(last?.lastBeat?.state ?? {}),
      }, 'warn', 'Poprzednia sesja urwała się bez zamknięcia (wyrzucenie, awaria lub zabicie karty)');
    } else {
      this.persist();
    }
  }

  static create(env: DiagData): DiagnosticsHub {
    const storage = HighscoreStorage.browserStorage();
    return new DiagnosticsHub(new DiagnosticStorage(storage), env, () => Date.now(), new InputRecordingStorage(storage));
  }

  /** Okruch: zwykłe zdarzenie w grze (nowe piętro, boss, śmierć…) — kontekst do późniejszej awarii. */
  note(kind: string, data?: DiagData, level: DiagLevel = 'info', message: string = kind): void {
    try {
      const event = this.log.record(this.clock(), kind, level, message, data);
      if (!event) return;
      this.persist();
      for (const listener of this.listeners) listener(kind, level, event.message);
    } catch {
      // Dziennik nie może zepsuć gry.
    }
  }

  /** Błąd z dowolnego źródła (window.onerror, odrzucona obietnica, wyjątek w pętli gry). */
  error(source: string, error: unknown, data?: DiagData): void {
    try {
      const { message, stack } = describeError(error);
      this.note(`error:${source}`, { ...(data ?? {}), ...(stack ? { stack } : {}) }, 'error', message);
    } catch {
      // Nic.
    }
  }

  /** Stan gry do pulsu (piętro, seed, bohater, HP…) — rejestruje scena; null = brak. */
  setStateProvider(provider: StateProvider | null): void {
    this.provider = provider;
  }

  currentState(): DiagData {
    try {
      return this.provider?.() ?? {};
    } catch {
      return { stateProviderFailed: true };
    }
  }

  heartbeat(fps: number | null, heapMB: number | null): void {
    try {
      this.log.heartbeat(this.clock(), this.currentState(), fps, heapMB);
      this.persist();
      this.flushInputs();
    } catch {
      // Nic.
    }
  }

  markCleanEnd(): void {
    try {
      this.log.markCleanEnd();
      this.persist();
      this.flushInputs();
    } catch {
      // Nic.
    }
  }

  /** Nagrywanie wejść (krok 56): start nowego piętra zamyka poprzednie nagranie i zaczyna kolejne. */
  startRecording(meta: RecordingMeta, now: number): void {
    try {
      this.flushInputs();
      this.recorder.start(meta, now);
    } catch {
      // Nic.
    }
  }

  recordInput(input: InputSample, now: number): void {
    try {
      this.recorder.sample(input, now);
    } catch {
      // Nic.
    }
  }

  /** Zapis bieżącego nagrania (obok poprzednich pięter) — przy pulsie, błędzie i zamknięciu. */
  flushInputs(): void {
    const current = this.recorder.snapshot();
    if (!current) return;
    const key = (r: InputRecording) => `${r.meta.startedAt}:${r.meta.floor}:${r.meta.runSeed}`;
    const rest = this.recordings.filter((r) => key(r) !== key(current));
    this.recordings = [...rest, current].slice(-DIAGNOSTICS.inputs.maxRecordings);
    this.inputStorage.save(this.recordings);
  }

  /** Ostatnie nagranie jako JSON do wklejenia (null, gdy brak). */
  lastRecordingJson(): string | null {
    this.flushInputs();
    const last = this.recordings[this.recordings.length - 1];
    return last ? JSON.stringify(last) : null;
  }

  /** Włącza wysyłkę zgłoszeń do zdalnego celu (krok 57); bez tego `canSendReports` jest false i przycisk się nie pokazuje. */
  setReporting(sink: ReportSink | null, clientId: string, build: string): void {
    this.reporting = sink ? { sink, clientId, build } : null;
  }

  /** Imię z tablicy wyników i wersja gry (PC / telefon) — podpis zgłoszeń i kontekst wiadomości (krok 133). */
  setIdentity(playerName: () => string | null, platform: string): void {
    this.playerName = playerName;
    this.platform = platform;
  }

  private currentPlayerName(): string | null {
    try {
      return this.playerName();
    } catch {
      return null;
    }
  }

  /**
   * Wiadomość z czatu „Napisz do autora” (krok 133): słowa testera z kontekstem gry, bez dziennika i nagrania.
   * Zwraca też `too-short`, gdy po uporządkowaniu nic nie zostało. Nigdy nie rzuca.
   */
  async sendFeedback(raw: string): Promise<SendResult | { readonly ok: false; readonly reason: 'too-short' }> {
    try {
      if (!this.reporting) return { ok: false, reason: 'unavailable' };
      const checked = normalizeFeedback(raw);
      if (!checked.ok) return checked;
      const now = this.clock();
      const wait = this.feedbackThrottle.waitMs(now);
      if (wait !== null) return { ok: false, reason: 'throttled', ...(Number.isFinite(wait) ? { retryAfterS: Math.ceil(wait / 1000) } : {}) };
      const playerName = this.currentPlayerName();
      const text = buildFeedbackText(checked.message, { state: this.currentState(), platform: this.platform, build: this.reporting.build, playerName });
      const sessions = [this.log.snapshot()];
      const envelope = buildEnvelope({ kind: 'feedback', build: this.reporting.build, clientId: this.reporting.clientId, sessions, reportText: text, playerName });
      const result = await this.reporting.sink.send(envelope);
      if (result.ok) this.feedbackThrottle.record(now);
      this.note('feedback-sent', { ok: result.ok, chars: checked.message.length, ...(result.ok ? {} : { reason: result.reason }) });
      return result;
    } catch {
      return { ok: false, reason: 'network' };
    }
  }

  /** Czy poprzednia sesja urwała się bez zamknięcia (ustalone przy starcie) — powód zgłoszenia „wyrzuciło mnie”. */
  get previousEndedAbnormally(): boolean {
    return endedAbnormally(this.previous[this.previous.length - 1]);
  }

  get canSendReports(): boolean {
    return this.reporting !== null;
  }

  /**
   * Wysyła zgłoszenie (ręcznie, z przycisku): koperta z bieżącego dziennika i opcjonalnie nagraniem ostatniego piętra.
   * Limity po stronie gry (odstęp, liczba na sesję) — limity workera są dodatkowym zabezpieczeniem. Nigdy nie rzuca.
   */
  async sendReport(kind: ReportKind, withRecording: boolean, automatic = false): Promise<SendResult> {
    try {
      if (!this.reporting) return { ok: false, reason: 'unavailable' };
      const now = this.clock();
      // Zgłoszenie automatyczne (awaria, za zgodą gracza) ma własny limit w `AutoReportPolicy`; nie blokuje go ręczny odstęp.
      const wait = automatic ? null : this.throttle.waitMs(now);
      if (wait !== null) return { ok: false, reason: 'throttled', ...(Number.isFinite(wait) ? { retryAfterS: Math.ceil(wait / 1000) } : {}) };
      this.flushInputs();
      const text = this.report();
      const sessions = [...this.previous, this.log.snapshot()].slice(-DIAGNOSTICS.maxSessions);
      const recording = withRecording ? (this.recordings[this.recordings.length - 1] ?? null) : null;
      const envelope = buildEnvelope({ kind, build: this.reporting.build, clientId: this.reporting.clientId, sessions, reportText: text, recording, playerName: this.currentPlayerName() });
      const result = await this.reporting.sink.send(envelope);
      if (result.ok && !automatic) this.throttle.record(now);
      this.note('report-sent', { ok: result.ok, kind, withRecording, automatic, ...(result.ok ? {} : { reason: result.reason }) });
      return result;
    } catch {
      return { ok: false, reason: 'network' };
    }
  }

  onEvent(listener: Listener): void {
    this.listeners.push(listener);
  }

  get errorCount(): number {
    return this.log.errorCount;
  }

  /** Raport z ostatnich sesji (łącznie z bieżącą). */
  report(): string {
    this.flushInputs();
    const lines = this.recordings.map(
      (r) =>
        `piętro ${r.meta.floor}, seed ${r.meta.runSeed}, ${r.meta.hero}: ${r.count} zmian wejścia, ${Math.round(r.durationMs / 1000)} s${r.truncated ? ' (PRZYCIĘTE — bez pełnego odtworzenia)' : ''}`,
    );
    const recordings = lines.length > 0 ? `\n\nNagrania wejść (do odtworzenia w trybie dev: __replay):\n${lines.join('\n')}` : '';
    return formatReport([...this.previous, this.log.snapshot()].slice(-DIAGNOSTICS.maxSessions)) + recordings;
  }

  private persist(): void {
    this.storage.save(this.previous, this.log.snapshot());
  }
}

/** Jedyna instancja; ustawia ją `installDiagnostics` na starcie gry. Przed instalacją (testy) wywołania są pustymi operacjami. */
let active: DiagnosticsHub | null = null;
export const setDiagnostics = (hub: DiagnosticsHub | null): void => {
  active = hub;
};
export const diag = {
  note(kind: string, data?: DiagData, level: DiagLevel = 'info', message?: string): void {
    active?.note(kind, data, level, message ?? kind);
  },
  error(source: string, error: unknown, data?: DiagData): void {
    active?.error(source, error, data);
  },
  setState(provider: StateProvider | null): void {
    active?.setStateProvider(provider);
  },
  startRecording(meta: RecordingMeta, now: number): void {
    active?.startRecording(meta, now);
  },
  recordInput(input: InputSample, now: number): void {
    active?.recordInput(input, now);
  },
};
