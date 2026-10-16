import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import { DiagnosticStorage } from '@/persistence/DiagnosticStorage';
import { HighscoreStorage } from '@/persistence/HighscoreStorage';
import type { DiagData, DiagLevel, DiagSession } from '@/systems/Diagnostics';
import { DiagnosticLog, describeError, endedAbnormally, formatReport } from '@/systems/Diagnostics';

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

  constructor(storage: DiagnosticStorage, env: DiagData, clock: () => number = () => Date.now()) {
    this.storage = storage;
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
    return new DiagnosticsHub(new DiagnosticStorage(HighscoreStorage.browserStorage()), env);
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
    } catch {
      // Nic.
    }
  }

  markCleanEnd(): void {
    try {
      this.log.markCleanEnd();
      this.persist();
    } catch {
      // Nic.
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
    return formatReport([...this.previous, this.log.snapshot()].slice(-DIAGNOSTICS.maxSessions));
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
};
