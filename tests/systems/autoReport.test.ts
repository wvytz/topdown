import { describe, expect, it } from 'vitest';
import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import { DiagnosticsHub } from '@/diagnostics/DiagnosticsHub';
import { AutoReportConsentStore } from '@/persistence/AutoReportConsent';
import { DiagnosticStorage } from '@/persistence/DiagnosticStorage';
import type { ReportSink } from '@/persistence/remoteReports';
import { AutoReportPolicy, isCriticalEvent } from '@/systems/AutoReport';
import type { ReportEnvelope } from '@/systems/ReportEnvelope';

const DEBOUNCE = DIAGNOSTICS.autoReport.debounceMs;

describe('automatyczne zgłoszenie awarii (krok 58)', () => {
  it('krytyczne: błędy (error:*), utrata WebGL, urwana poprzednia sesja; reszta nie', () => {
    expect(isCriticalEvent('error:loop', 'error')).toBe(true);
    expect(isCriticalEvent('error:window', 'error')).toBe(true);
    expect(isCriticalEvent('webgl-context-lost', 'error')).toBe(true);
    expect(isCriticalEvent('previous-session-ended-abnormally', 'warn')).toBe(true);
    expect(isCriticalEvent('frame-stall', 'warn')).toBe(false);
    expect(isCriticalEvent('low-fps', 'warn')).toBe(false);
    expect(isCriticalEvent('insane-state', 'error')).toBe(false);
    expect(isCriticalEvent('player-stuck', 'warn')).toBe(false);
    expect(isCriticalEvent('floor-start', 'info')).toBe(false);
  });

  it('za zgodą: wysyła po krótkim zebraniu zdarzeń, raz na sesję', () => {
    const p = new AutoReportPolicy();
    expect(p.poll(0, 'yes')).toBeNull(); // nic się nie stało
    p.onEvent(1000, 'error:loop', 'error');
    p.onEvent(2000, 'error:loop', 'error'); // kolejne nie przesuwa okna
    expect(p.poll(1000 + DEBOUNCE - 1, 'yes')).toBeNull();
    expect(p.poll(1000 + DEBOUNCE, 'yes')).toBe('send');
    expect(p.poll(1000 + DEBOUNCE + 1, 'yes')).toBeNull();
    p.onEvent(60_000, 'error:window', 'error'); // druga awaria w tej samej sesji — limit wyczerpany
    expect(p.poll(70_000, 'yes')).toBeNull();
    expect(p.hasPending).toBe(false);
  });

  it('bez zgody (nie): nigdy nie wysyła ani nie pyta', () => {
    const p = new AutoReportPolicy();
    p.onEvent(0, 'error:loop', 'error');
    expect(p.poll(DEBOUNCE, 'no')).toBeNull();
    expect(p.hasPending).toBe(false);
  });

  it('bez decyzji: pyta raz na sesję; „tak” wysyła zaległe zgłoszenie, „nie” je porzuca', () => {
    const yes = new AutoReportPolicy();
    yes.onEvent(0, 'webgl-context-lost', 'error');
    expect(yes.poll(DEBOUNCE, null)).toBe('ask');
    expect(yes.poll(DEBOUNCE + 1000, null)).toBeNull(); // nie pyta ponownie
    expect(yes.claimPending()).toBe(true);
    expect(yes.claimPending()).toBe(false); // jedno zgłoszenie
    const no = new AutoReportPolicy();
    no.onEvent(0, 'error:loop', 'error');
    expect(no.poll(DEBOUNCE, null)).toBe('ask');
    no.dismissPending();
    expect(no.poll(DEBOUNCE * 5, 'yes')).toBeNull();
  });

  it('urwana poprzednia sesja uruchamia ten sam tryb (pytanie albo wysyłka)', () => {
    const asks = new AutoReportPolicy();
    asks.onEvent(0, 'previous-session-ended-abnormally', 'warn');
    expect(asks.poll(DEBOUNCE, null)).toBe('ask');
    const sends = new AutoReportPolicy();
    sends.onEvent(0, 'previous-session-ended-abnormally', 'warn');
    expect(sends.poll(DEBOUNCE, 'yes')).toBe('send');
  });

  it('zgoda: zapamiętana, tylko tak/nie, odporna na uszkodzony i zablokowany magazyn', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const store = new AutoReportConsentStore(storage);
    expect(store.load()).toBeNull();
    store.save('yes');
    expect(new AutoReportConsentStore(storage).load()).toBe('yes');
    data.set(DIAGNOSTICS.autoReport.consentKey, 'cokolwiek');
    expect(new AutoReportConsentStore(storage).load()).toBeNull();
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('y'); } };
    const blocked = new AutoReportConsentStore(broken);
    expect(blocked.load()).toBeNull();
    blocked.save('no');
    expect(blocked.load()).toBe('no');
    expect(new AutoReportConsentStore(null).load()).toBeNull();
  });
});

class FakeStorage {
  readonly data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

describe('hub: zgłoszenie automatyczne (krok 58)', () => {
  const make = () => {
    const sent: ReportEnvelope[] = [];
    const sink: ReportSink = {
      async send(envelope) {
        sent.push(envelope);
        return { ok: true, id: sent.length };
      },
    };
    const hub = new DiagnosticsHub(new DiagnosticStorage(new FakeStorage()), {}, () => 1000);
    hub.setReporting(sink, 'client-abc-123', 'test');
    return { hub, sent };
  };

  it('automatyczne wysyła rodzaj crash i nie jest blokowane odstępem ręcznych wysyłek', async () => {
    const { hub, sent } = make();
    expect((await hub.sendReport('diagnostic', false)).ok).toBe(true);
    expect(await hub.sendReport('diagnostic', false)).toMatchObject({ ok: false, reason: 'throttled' });
    expect((await hub.sendReport('crash', true, true)).ok).toBe(true);
    expect(sent.map((e) => e.kind)).toEqual(['diagnostic', 'crash']);
  });

  it('bez celu wysyłki nic nie wysyła; „poprzednia sesja urwana” jest rozpoznawana przy starcie', async () => {
    const fake = new FakeStorage();
    const first = new DiagnosticsHub(new DiagnosticStorage(fake), {}, () => 1000);
    expect(first.previousEndedAbnormally).toBe(false);
    expect(await first.sendReport('crash', true, true)).toMatchObject({ ok: false, reason: 'unavailable' });
    const second = new DiagnosticsHub(new DiagnosticStorage(fake), {}, () => 5000); // pierwsza nie zamknęła się czysto
    expect(second.previousEndedAbnormally).toBe(true);
    second.markCleanEnd();
    expect(new DiagnosticsHub(new DiagnosticStorage(fake), {}, () => 9000).previousEndedAbnormally).toBe(false);
  });
});
