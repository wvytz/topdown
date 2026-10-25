import { describe, expect, it } from 'vitest';
import { DIAGNOSTICS } from '@/config/diagnosticsConfig';
import { DiagnosticLog } from '@/systems/Diagnostics';
import { buildEnvelope } from '@/systems/ReportEnvelope';
import type { NormalizedReport, ReportRepo } from '../../worker/src/reports.js';
import { REPORT_LIMITS, decideQuota, processReport, retentionCutoff, tokensEqual, validateReport } from '../../worker/src/reports.js';

const valid = (over: Record<string, unknown> = {}) => ({
  v: 1,
  kind: 'diagnostic',
  app: { build: 'production' },
  client: { id: 'abc123def456', sessionId: 'k3j2h1' },
  summary: { errors: 2, warnings: 1, floor: 3, hero: 'sorceress', seed: 123456, abnormalPrev: false },
  text: 'TOP DOWN — raport diagnostyczny\n+1.0s [ERR ] error:loop: Boom',
  ...over,
});

class MemoryRepo implements ReportRepo {
  rows: Array<NormalizedReport & { ipHash: string; textHash: string; createdAt: number }> = [];
  async countByIp(ipHash: string, since: number) {
    return this.rows.filter((r) => r.ipHash === ipHash && r.createdAt > since).length;
  }
  async countAll(since: number) {
    return this.rows.filter((r) => r.createdAt > since).length;
  }
  async findDuplicate(clientId: string, textHash: string, since: number) {
    return this.rows.some((r) => r.clientId === clientId && r.textHash === textHash && r.createdAt > since);
  }
  async insert(row: NormalizedReport & { ipHash: string; textHash: string; createdAt: number }) {
    this.rows.push(row);
    return this.rows.length;
  }
}

const NOW = 1_800_000_000_000;

describe('worker: walidacja zgłoszeń (krok 57)', () => {
  it('przyjmuje poprawną kopertę i normalizuje pola; nieznane pola są ignorowane', () => {
    const r = validateReport(valid({ nowePoleZPrzyszlosci: { x: 1 }, summary: { floor: 3, extra: 'x' } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toMatchObject({ kind: 'diagnostic', build: 'production', clientId: 'abc123def456', summary: { floor: 3 } });
    expect(r.report.summary).not.toHaveProperty('extra');
    expect(r.report.attachments).toEqual([]);
  });

  it.each([
    ['nie obiekt', 'tekst', 'not an object'],
    ['tablica', [], 'not an object'],
    ['brak wersji', valid({ v: undefined }), 'missing version'],
    ['nowsza wersja', valid({ v: 2 }), 'unsupported version'],
    ['nieznany rodzaj', valid({ kind: 'hack' }), 'unknown kind'],
    ['zła sekcja', valid({ app: 5 }), 'bad section'],
    ['zły build', valid({ app: { build: '<script>' } }), 'bad build'],
    ['zły identyfikator klienta', valid({ client: { id: 'a b' } }), 'bad client id'],
    ['zła liczba błędów', valid({ summary: { errors: -1 } }), 'bad summary.errors'],
    ['zły seed', valid({ summary: { seed: 2 ** 33 } }), 'bad summary.seed'],
    ['piętro poza zakresem', valid({ summary: { floor: 0 } }), 'bad summary.floor'],
    ['zły bohater', valid({ summary: { hero: 'a b!' } }), 'bad summary.hero'],
    ['pusty tekst', valid({ text: '' }), 'missing text'],
    ['za długi tekst', valid({ text: 'x'.repeat(REPORT_LIMITS.maxTextChars + 1) }), 'text too long'],
    ['za dużo załączników', valid({ attachments: [1, 2, 3] }), 'too many attachments'],
    ['zły typ załącznika', valid({ attachments: [{ name: 'a.json', type: 'exe', data: 'x' }] }), 'bad attachment type'],
    ['za długi załącznik', valid({ attachments: [{ name: 'a.json', type: 'json', data: 'x'.repeat(REPORT_LIMITS.maxAttachmentChars + 1) }] }), 'attachment too long'],
  ])('odrzuca: %s', (_name, body, reason) => {
    const r = validateReport(body);
    expect(r).toEqual({ ok: false, reason });
  });

  it('limit całości: tekst + załączniki', () => {
    const big = { name: 'a.json', type: 'json', data: 'x'.repeat(REPORT_LIMITS.maxAttachmentChars) };
    const r = validateReport(valid({ text: 'x'.repeat(REPORT_LIMITS.maxTextChars), attachments: [big, big] }));
    expect(r).toEqual({ ok: false, reason: 'report too large' });
  });

  it('koperta zbudowana przez grę przechodzi walidację workera (kontrakt)', () => {
    const log = new DiagnosticLog('sess1', 1000, { ua: 'x' });
    log.record(2000, 'error:loop', 'error', 'Boom');
    log.heartbeat(5000, { floor: 4, seed: 99, hero: 'barbarian' }, 58, 120);
    const envelope = buildEnvelope({ kind: 'diagnostic', build: 'production', clientId: 'a1b2c3d4e5f60718', sessions: [log.snapshot()], reportText: 'raport '.repeat(100) });
    const checked = validateReport(envelope);
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.report.summary).toMatchObject({ errors: 1, floor: 4, seed: 99, hero: 'barbarian', abnormalPrev: false });
    // Limity gry nie mogą przekraczać limitów workera.
    expect(DIAGNOSTICS.reports.version).toBe(REPORT_LIMITS.version);
    expect(DIAGNOSTICS.reports.maxTextChars).toBeLessThanOrEqual(REPORT_LIMITS.maxTextChars);
    expect(DIAGNOSTICS.reports.maxAttachmentChars).toBeLessThanOrEqual(REPORT_LIMITS.maxAttachmentChars);
    expect(DIAGNOSTICS.reports.maxBodyChars).toBeLessThanOrEqual(REPORT_LIMITS.maxBodyChars);
  });
});

describe('worker: limity (krok 57)', () => {
  it('decideQuota: poniżej limitów null; godzinowy, dobowy i globalny z kodami i Retry-After', () => {
    expect(decideQuota({ ipHour: 0, ipDay: 0, globalDay: 0 })).toBeNull();
    expect(decideQuota({ ipHour: REPORT_LIMITS.perIpHour - 1, ipDay: 3, globalDay: 10 })).toBeNull();
    expect(decideQuota({ ipHour: REPORT_LIMITS.perIpHour, ipDay: 5, globalDay: 10 })).toMatchObject({ status: 429, reason: 'too many reports (hour)' });
    expect(decideQuota({ ipHour: 0, ipDay: REPORT_LIMITS.perIpDay, globalDay: 10 })).toMatchObject({ status: 429, reason: 'too many reports (day)' });
    expect(decideQuota({ ipHour: 0, ipDay: 0, globalDay: REPORT_LIMITS.globalDay })).toMatchObject({ status: 503, retryAfterS: 3600 });
  });

  it('processReport: poprawne zgłoszenie = 201 i zapis; zły = 400 bez zapisu', async () => {
    const repo = new MemoryRepo();
    const ok = await processReport({ body: valid(), ipHash: 'ip1', now: NOW, repo });
    expect(ok.status).toBe(201);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({ ipHash: 'ip1', createdAt: NOW, kind: 'diagnostic', clientId: 'abc123def456' });
    const bad = await processReport({ body: valid({ kind: 'x' }), ipHash: 'ip1', now: NOW, repo });
    expect(bad).toMatchObject({ status: 400, body: { reason: 'unknown kind' } });
    expect(repo.rows).toHaveLength(1);
  });

  it('deduplikacja: ponowienie tego samego raportu nie zapisuje i nie zużywa limitu; inny raport tak', async () => {
    const repo = new MemoryRepo();
    await processReport({ body: valid(), ipHash: 'ip1', now: NOW, repo });
    for (let i = 0; i < 30; i++) {
      const again = await processReport({ body: valid(), ipHash: 'ip1', now: NOW + i * 1000, repo });
      expect(again).toMatchObject({ status: 200, body: { duplicate: true } });
    }
    expect(repo.rows).toHaveLength(1);
    const other = await processReport({ body: valid({ text: 'inny raport' }), ipHash: 'ip1', now: NOW + 40_000, repo });
    expect(other.status).toBe(201);
    // Po upływie okna deduplikacji to samo jest nowym zgłoszeniem.
    const later = await processReport({ body: valid(), ipHash: 'ip1', now: NOW + REPORT_LIMITS.dedupeWindowMs + 1000, repo });
    expect(later.status).toBe(201);
  });

  it('limit z jednego adresu: po limicie godzinowym 429 z Retry-After; inny adres nadal może wysłać', async () => {
    const repo = new MemoryRepo();
    for (let i = 0; i < REPORT_LIMITS.perIpHour; i++) {
      expect((await processReport({ body: valid({ text: `raport ${i}` }), ipHash: 'ip1', now: NOW + i, repo })).status).toBe(201);
    }
    const blocked = await processReport({ body: valid({ text: 'raport za dużo' }), ipHash: 'ip1', now: NOW + 100, repo });
    expect(blocked).toMatchObject({ status: 429, headers: { 'Retry-After': '3600' } });
    expect(repo.rows).toHaveLength(REPORT_LIMITS.perIpHour);
    expect((await processReport({ body: valid({ text: 'z innego adresu' }), ipHash: 'ip2', now: NOW + 100, repo })).status).toBe(201);
    // Po godzinie limit godzinowy się odnawia (dobowy jeszcze nie).
    const after = await processReport({ body: valid({ text: 'po godzinie' }), ipHash: 'ip1', now: NOW + 3_700_000, repo });
    expect(after.status).toBe(201);
  });

  it('globalny bezpiecznik dobowy chroni przed zalewem z wielu adresów (503)', async () => {
    const repo = new MemoryRepo();
    const limits = { ...REPORT_LIMITS, globalDay: 5 };
    for (let i = 0; i < 5; i++) await processReport({ body: valid({ text: `r${i}` }), ipHash: `ip${i}`, now: NOW, repo, limits });
    const res = await processReport({ body: valid({ text: 'r-extra' }), ipHash: 'ip-new', now: NOW, repo, limits });
    expect(res.status).toBe(503);
    expect(repo.rows).toHaveLength(5);
  });

  it('retencja: granica to 30 dni wstecz; tokeny porównywane poprawnie', async () => {
    expect(retentionCutoff(NOW)).toBe(NOW - 30 * 24 * 3600 * 1000);
    expect(await tokensEqual('sekret', 'sekret')).toBe(true);
    expect(await tokensEqual('sekret', 'sekreT')).toBe(false);
    expect(await tokensEqual('', '')).toBe(false); // brak skonfigurowanego sekretu = brak dostępu
    expect(await tokensEqual('x', undefined)).toBe(false);
  });
});
