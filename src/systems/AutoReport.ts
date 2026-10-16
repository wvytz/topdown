import { DIAGNOSTICS } from '@/config/diagnosticsConfig';

/**
 * Automatyczna wysyłka zgłoszenia przy awarii (krok 58). Czysta polityka: które zdarzenia są krytyczne, kiedy (po krótkim
 * zebraniu kolejnych zdarzeń) i czy wolno wysłać — decyzja zależy od zgody gracza (tak / nie / jeszcze nie pytano).
 * Wysyła `diagnostics/installDiagnostics`; tu tylko logika, bez przeglądarki.
 */
export type AutoReportConsent = 'yes' | 'no' | null;

export type AutoReportDecision = 'send' | 'ask' | null;

/** Zdarzenia, które uruchamiają zgłoszenie awarii: błędy (okno, obietnice, pętla), utrata WebGL i urwana poprzednia sesja. */
export function isCriticalEvent(kind: string, level: string): boolean {
  if (level === 'error' && kind.startsWith('error:')) return true;
  return kind === 'webgl-context-lost' || kind === 'previous-session-ended-abnormally';
}

export class AutoReportPolicy {
  private pendingSince: number | null = null;
  private sent = 0;
  private asked = false;

  constructor(private readonly config: typeof DIAGNOSTICS.autoReport = DIAGNOSTICS.autoReport) {}

  /** Zdarzenie z dziennika; krytyczne zaczyna okno zbierania (kolejne nie przesuwają jego początku). */
  onEvent(now: number, kind: string, level: string): void {
    if (this.pendingSince === null && isCriticalEvent(kind, level)) this.pendingSince = now;
  }

  /** Co zrobić teraz: wysłać (jest zgoda i limit nie wyczerpany), zapytać o zgodę (raz na sesję) albo nic. */
  poll(now: number, consent: AutoReportConsent): AutoReportDecision {
    if (this.pendingSince === null || now - this.pendingSince < this.config.debounceMs) return null;
    if (consent === 'no') {
      this.pendingSince = null;
      return null;
    }
    if (consent === 'yes') {
      this.pendingSince = null;
      if (this.sent >= this.config.maxPerSession) return null;
      this.sent++;
      return 'send';
    }
    // Brak decyzji: pytamy raz na sesję; zdarzenie czeka na odpowiedź (po „tak” zostanie wysłane, po „nie” zniknie).
    if (this.asked) return null;
    this.asked = true;
    return 'ask';
  }

  /** Po odpowiedzi „tak” z pytania: wysyłamy zaległe zgłoszenie (liczone do limitu sesji). */
  claimPending(): boolean {
    if (this.pendingSince === null || this.sent >= this.config.maxPerSession) {
      this.pendingSince = null;
      return false;
    }
    this.pendingSince = null;
    this.sent++;
    return true;
  }

  dismissPending(): void {
    this.pendingSince = null;
  }

  get hasPending(): boolean {
    return this.pendingSince !== null;
  }
}
