import { describe, expect, it } from 'vitest';
import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import { DiagnosticStorage } from '@/persistence/DiagnosticStorage';
import { DiagnosticsHub } from '@/diagnostics/DiagnosticsHub';
import type { DiagSession } from '@/systems/Diagnostics';
import { DiagnosticLog, FrameMonitor, describeError, endedAbnormally, formatReport, parseSessions, sanityIssues, trimSessions } from '@/systems/Diagnostics';

const makeLog = () => new DiagnosticLog('s1', 1000, { ua: 'test' });

class FakeStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('dziennik diagnostyczny (krok 55)', () => {
  it('describeError: Error, tekst, obiekt i wartość cykliczna; długie komunikaty są przycinane', () => {
    expect(describeError(new TypeError('boom')).message).toBe('TypeError: boom');
    expect(describeError(new Error('x')).stack).toBeTypeOf('string');
    expect(describeError('tekst').message).toBe('tekst');
    expect(describeError({ a: 1 }).message).toBe('{"a":1}');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(describeError(cyclic).message).toBeTypeOf('string');
    expect(describeError('x'.repeat(5000)).message.length).toBeLessThanOrEqual(DIAGNOSTICS.maxMessageLength + 1);
  });

  it('zdarzenia: czas od startu sesji, kolejność, limit pojemności (najstarsze wypadają)', () => {
    const log = makeLog();
    for (let i = 0; i < DIAGNOSTICS.maxEvents + 10; i++) log.record(1000 + i * 100_000, 'k', 'info', `m${i}`);
    const snap = log.snapshot();
    expect(snap.events).toHaveLength(DIAGNOSTICS.maxEvents);
    expect(snap.events[0]!.message).toBe('m10');
    expect(snap.events[0]!.t).toBe(10 * 100_000);
  });

  it('deduplikacja: ten sam błąd w oknie się zlicza, po limicie nie jest zwracany; poza oknem to nowy wpis', () => {
    const log = makeLog();
    const first = log.record(1000, 'error:loop', 'error', 'Boom');
    expect(first?.count).toBe(1);
    let returned = 0;
    for (let i = 0; i < 20; i++) if (log.record(1100 + i, 'error:loop', 'error', 'Boom')) returned++;
    expect(returned).toBe(DIAGNOSTICS.maxSameEvents - 1);
    expect(log.snapshot().events).toHaveLength(1);
    expect(log.snapshot().events[0]!.count).toBe(21);
    expect(log.errorCount).toBe(21);
    const later = log.record(1000 + DIAGNOSTICS.dedupeWindowMs + 5000, 'error:loop', 'error', 'Boom');
    expect(later?.count).toBe(1);
    expect(log.snapshot().events).toHaveLength(2);
  });

  it('sesja urwana: tylko gdy poprzednia nie zgłosiła zamknięcia', () => {
    const log = makeLog();
    expect(endedAbnormally(log.snapshot())).toBe(true);
    log.markCleanEnd();
    expect(endedAbnormally(log.snapshot())).toBe(false);
    expect(endedAbnormally(null)).toBe(false);
  });

  it('trimSessions: ostatnie sesje i twardy limit rozmiaru; parseSessions znosi uszkodzony zapis', () => {
    const sessions: DiagSession[] = Array.from({ length: 6 }, (_, i) => {
      const log = new DiagnosticLog(`s${i}`, i, {});
      for (let j = 0; j < 60; j++) log.record(i + j * 20_000, 'k', 'info', `wpis ${j} ${'x'.repeat(200)}`);
      return log.snapshot();
    });
    const trimmed = trimSessions(sessions, 20_000);
    expect(trimmed.length).toBeLessThanOrEqual(DIAGNOSTICS.maxSessions);
    expect(JSON.stringify(trimmed).length).toBeLessThanOrEqual(20_000);
    expect(trimmed[trimmed.length - 1]!.id).toBe('s5');
    expect(parseSessions('{zepsute')).toEqual([]);
    expect(parseSessions('{"a":1}')).toEqual([]);
    expect(parseSessions(null)).toEqual([]);
    expect(parseSessions(JSON.stringify([{ id: 'ok', events: [] }, 5, null]))).toHaveLength(1);
  });

  it('monitor klatek: zacięcie z odstępem, mulenie po oknie, długa klatka nie liczy się do FPS', () => {
    const m = new FrameMonitor();
    expect(m.frame(16, 100)).toEqual([]);
    expect(m.frame(900, 1000)).toEqual([{ kind: 'stall', deltaMs: 900 }]);
    expect(m.frame(900, 1500)).toEqual([]); // w odstępie
    let t = 2000;
    let low = 0;
    for (let i = 0; i < 400; i++) {
      t += 80; // ~12 FPS
      low += m.frame(80, t).filter((a) => a.kind === 'low-fps').length;
    }
    expect(low).toBeGreaterThanOrEqual(1);
    const fast = new FrameMonitor();
    let fastLow = 0;
    for (let i = 0; i < 1000; i++) fastLow += fast.frame(16, 100 + i * 16).length;
    expect(fastLow).toBe(0);
  });

  it('kontrola stanu: NaN, poza mapą, HP poza zakresem', () => {
    const world = { width: 1000, height: 800 };
    expect(sanityIssues({ x: 10, y: 10, hp: 50, maxHp: 100 }, world)).toEqual([]);
    expect(sanityIssues({ x: NaN, y: 10, hp: 50, maxHp: 100 }, world)).toHaveLength(1);
    expect(sanityIssues({ x: 5000, y: 10, hp: 50, maxHp: 100 }, world)).toHaveLength(1);
    expect(sanityIssues({ x: 10, y: 10, hp: -3, maxHp: 100 }, world)).toHaveLength(1);
    expect(sanityIssues({ x: 10, y: 10, hp: 120, maxHp: 100 }, world)).toHaveLength(1);
    expect(sanityIssues({ x: 10, y: 10, hp: NaN, maxHp: 100 }, world)).toHaveLength(1);
  });

  it('raport: sesje, zdarzenia z licznikiem, znacznik sesji urwanej i ostatni puls', () => {
    const log = makeLog();
    log.record(2000, 'error:loop', 'error', 'Boom', { floor: 3 });
    log.record(2100, 'error:loop', 'error', 'Boom');
    log.heartbeat(5000, { floor: 3 }, 58.4, 120);
    const text = formatReport([log.snapshot()]);
    expect(text).toContain('URWANA');
    expect(text).toContain('[ERR ] error:loop: Boom (×2)');
    expect(text).toContain('Ostatni puls +4.0s: fps=58.4 sterta=120MB');
    log.markCleanEnd();
    expect(formatReport([log.snapshot()])).toContain('zamknięta normalnie');
  });
});

describe('DiagnosticsHub (krok 55)', () => {
  it('zapisuje sesję na bieżąco; kolejna sesja po urwanej zapisuje to w dzienniku wraz z ostatnim stanem', () => {
    const fake = new FakeStorage();
    const first = new DiagnosticsHub(new DiagnosticStorage(fake), { ua: 'a' }, () => 5000);
    first.setStateProvider(() => ({ floor: 4, hero: 'sorceress' }));
    first.heartbeat(60, 100);
    first.error('loop', new Error('padło'));
    // brak markCleanEnd = urwana
    const second = new DiagnosticsHub(new DiagnosticStorage(fake), { ua: 'b' }, () => 9000);
    const report = second.report();
    expect(report).toContain('previous-session-ended-abnormally');
    expect(report).toContain('"floor":4');
    expect(report).toContain('Error: padło');
  });

  it('po czystym zamknięciu następna sesja nie zgłasza urwania', () => {
    const fake = new FakeStorage();
    const first = new DiagnosticsHub(new DiagnosticStorage(fake), {}, () => 1000);
    first.markCleanEnd();
    const second = new DiagnosticsHub(new DiagnosticStorage(fake), {}, () => 2000);
    expect(second.report()).not.toContain('previous-session-ended-abnormally');
  });

  it('nigdy nie rzuca: zepsuty magazyn i zepsuty dostawca stanu są połykane', () => {
    const broken = {
      getItem: () => {
        throw new Error('zablokowany');
      },
      setItem: () => {
        throw new Error('pełny');
      },
    };
    const hub = new DiagnosticsHub(new DiagnosticStorage(broken), {}, () => 1);
    hub.setStateProvider(() => {
      throw new Error('dostawca');
    });
    expect(() => {
      hub.note('x');
      hub.error('window', new Error('e'));
      hub.heartbeat(1, 1);
      hub.markCleanEnd();
      hub.report();
    }).not.toThrow();
    expect(hub.currentState()).toEqual({ stateProviderFailed: true });
  });

  it('słuchacze dostają błędy (dla nakładki), ale nie zduszone duplikaty', () => {
    const hub = new DiagnosticsHub(new DiagnosticStorage(new FakeStorage()), {}, () => 1);
    const seen: string[] = [];
    hub.onEvent((kind) => seen.push(kind));
    for (let i = 0; i < 30; i++) hub.error('loop', new Error('ten sam'));
    expect(seen.length).toBe(DIAGNOSTICS.maxSameEvents);
  });
});
