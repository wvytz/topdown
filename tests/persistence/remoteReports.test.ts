import { describe, expect, it } from 'vitest';
import { getClientId } from '@/persistence/ClientId';
import { createWorkerReportSink } from '@/persistence/remoteReports';
import type { ReportEnvelope } from '@/systems/ReportEnvelope';
import { SendThrottle, buildEnvelope, clipReportText } from '@/systems/ReportEnvelope';
import { DiagnosticLog } from '@/systems/Diagnostics';

const ENVELOPE: ReportEnvelope = { v: 1, kind: 'diagnostic', app: { build: 'x' }, client: { id: 'abc', sessionId: 's' }, summary: { errors: 0, warnings: 0, abnormalPrev: false }, text: 't' };

const respond = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => async () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('adapter wysyłki zgłoszeń (krok 57)', () => {
  it('201/200 → ok (z id i znacznikiem duplikatu)', async () => {
    expect(await createWorkerReportSink('https://w.example/', respond(201, { ok: true, id: 7 })).send(ENVELOPE)).toEqual({ ok: true, id: 7 });
    expect(await createWorkerReportSink('https://w.example', respond(200, { ok: true, duplicate: true })).send(ENVELOPE)).toEqual({ ok: true, duplicate: true });
  });

  it('kody błędów są tłumaczone na powody; Retry-After przekazywany', async () => {
    expect(await createWorkerReportSink('https://w', respond(429, {}, { 'Retry-After': '120' })).send(ENVELOPE)).toEqual({ ok: false, reason: 'rate-limited', retryAfterS: 120 });
    expect(await createWorkerReportSink('https://w', respond(503)).send(ENVELOPE)).toEqual({ ok: false, reason: 'unavailable', retryAfterS: 3600 });
    expect(await createWorkerReportSink('https://w', respond(413)).send(ENVELOPE)).toEqual({ ok: false, reason: 'too-large' });
    expect(await createWorkerReportSink('https://w', respond(400)).send(ENVELOPE)).toEqual({ ok: false, reason: 'rejected' });
  });

  it('błąd sieci i przekroczenie czasu nie rzucają wyjątku', async () => {
    const fail = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await createWorkerReportSink('https://w', fail).send(ENVELOPE)).toEqual({ ok: false, reason: 'network' });
    const hang = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort'))));
    expect(await createWorkerReportSink('https://w', hang, 20).send(ENVELOPE)).toEqual({ ok: false, reason: 'network' });
  });

  it('POST na /reports z kopertą jako JSON', async () => {
    let seen: { url: string; init: RequestInit | undefined } | null = null;
    const sink = createWorkerReportSink('https://w.example//', async (url, init) => {
      seen = { url, init };
      return new Response('{}', { status: 201 });
    });
    await sink.send(ENVELOPE);
    expect(seen!.url).toBe('https://w.example/reports');
    expect(seen!.init?.method).toBe('POST');
    expect(JSON.parse(String(seen!.init?.body))).toEqual(ENVELOPE);
  });
});

describe('koperta i ograniczenia wysyłki (krok 57)', () => {
  it('przycinanie tekstu zachowuje początek i koniec', () => {
    const text = `START${'x'.repeat(500)}KONIEC`;
    const clipped = clipReportText(text, 200);
    expect(clipped.length).toBeLessThanOrEqual(200);
    expect(clipped.startsWith('START')).toBe(true);
    expect(clipped.endsWith('KONIEC')).toBe(true);
    expect(clipReportText('krótki', 200)).toBe('krótki');
  });

  it('podsumowanie: liczniki błędów z powtórzeń, ostatni stan gry, znacznik urwanej poprzedniej sesji', () => {
    const prev = new DiagnosticLog('p', 0, {});
    const cur = new DiagnosticLog('c', 10_000, {});
    for (let i = 0; i < 3; i++) cur.record(11_000 + i, 'error:loop', 'error', 'Boom');
    cur.record(12_000, 'frame-stall', 'warn', 'Zacięcie');
    cur.heartbeat(15_000, { floor: 5, hero: 'sorceress', seed: 7 }, 50, 100);
    const env = buildEnvelope({ kind: 'crash', build: 'dev mode!', clientId: 'ID-1', sessions: [prev.snapshot(), cur.snapshot()], reportText: 'raport' });
    expect(env.kind).toBe('crash');
    expect(env.summary).toEqual({ errors: 3, warnings: 1, floor: 5, hero: 'sorceress', seed: 7, abnormalPrev: true });
    expect(env.app.build).toBe('dev mode');
    expect(env.client).toEqual({ id: 'ID-1', sessionId: 'c' });
  });

  it('za duże nagranie jest pomijane w kopercie, nie obcinane', () => {
    const cur = new DiagnosticLog('c', 0, {});
    const meta = { runSeed: 1, floor: 2, hero: 'barbarian', gold: 0, items: [], hp: null, practice: false, startedAt: 1 };
    const small = { meta, entries: '0,1,0,0,5,5', count: 1, firstAtMs: 0, durationMs: 5, truncated: false };
    const huge = { ...small, entries: 'x'.repeat(200_000) };
    const withSmall = buildEnvelope({ kind: 'diagnostic', build: 'b', clientId: 'cid', sessions: [cur.snapshot()], reportText: 't', recording: small });
    expect(withSmall.attachments).toHaveLength(1);
    expect(withSmall.attachments![0]).toMatchObject({ type: 'input-recording', name: 'input-floor2.json' });
    expect(buildEnvelope({ kind: 'diagnostic', build: 'b', clientId: 'cid', sessions: [cur.snapshot()], reportText: 't', recording: huge }).attachments).toBeUndefined();
  });

  it('SendThrottle: odstęp i limit na sesję', () => {
    const t = new SendThrottle({ minIntervalMs: 60_000, maxPerSession: 2 });
    expect(t.waitMs(0)).toBeNull();
    t.record(0);
    expect(t.waitMs(30_000)).toBe(30_000);
    expect(t.waitMs(60_000)).toBeNull();
    t.record(60_000);
    expect(t.waitMs(500_000)).toBe(Infinity);
  });

  it('identyfikator klienta: zapamiętany, poprawny format, działa bez magazynu', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const a = getClientId(storage);
    expect(a).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(getClientId(storage)).toBe(a);
    expect(getClientId(null)).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('y'); } };
    expect(getClientId(broken)).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });
});
