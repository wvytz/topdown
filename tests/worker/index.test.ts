import { describe, expect, it } from 'vitest';
import worker, { validate } from '../../worker/src/index.js';
import { REPORT_LIMITS } from '../../worker/src/reports.js';

/** Minimalna atrapa D1 dla zapytań workera (rozpoznaje je po treści SQL) — sprawdza routing, nagłówki i limity bez Cloudflare. */
type Row = Record<string, unknown>;
function fakeDb() {
  const reports: Row[] = [];
  let nextId = 1;
  const db = {
    reports,
    prepare(sql: string) {
      let args: unknown[] = [];
      const run = async () => {
        if (sql.startsWith('INSERT INTO reports')) {
          const [created_at, ip_hash, schema_version, kind, build, client_id, session_id, errors, warnings, floor, hero, seed, abnormal_prev, text_hash, size, text, attachments] = args;
          const id = nextId++;
          reports.push({ id, created_at, ip_hash, schema_version, kind, build, client_id, session_id, errors, warnings, floor, hero, seed, abnormal_prev, text_hash, size, text, attachments });
          return { meta: { last_row_id: id } };
        }
        if (sql.startsWith('DELETE FROM reports WHERE id')) {
          const i = reports.findIndex((r) => r.id === args[0]);
          if (i >= 0) reports.splice(i, 1);
        }
        if (sql.startsWith('DELETE FROM reports WHERE created_at')) {
          for (let i = reports.length - 1; i >= 0; i--) if ((reports[i]!.created_at as number) < (args[0] as number)) reports.splice(i, 1);
        }
        return { meta: {} };
      };
      const first = async () => {
        if (sql.includes('COUNT(*)') && sql.includes('ip_hash')) return { n: reports.filter((r) => r.ip_hash === args[0] && (r.created_at as number) > (args[1] as number)).length };
        if (sql.includes('COUNT(*)')) return { n: reports.filter((r) => (r.created_at as number) > (args[0] as number)).length };
        if (sql.includes('SELECT 1 AS x')) return reports.some((r) => r.client_id === args[0] && r.text_hash === args[1] && (r.created_at as number) > (args[2] as number)) ? { x: 1 } : null;
        if (sql.startsWith('SELECT * FROM reports WHERE id')) return reports.find((r) => r.id === args[0]) ?? null;
        return null;
      };
      const all = async () => {
        if (sql.includes('FROM reports') && sql.includes('ORDER BY id DESC')) {
          const limit = args[args.length - 1] as number;
          return { results: [...reports].reverse().slice(0, limit).map(({ text: _t, attachments: _a, ip_hash: _i, text_hash: _h, ...meta }) => meta) };
        }
        return { results: [] };
      };
      const statement = {
        bind(...a: unknown[]) {
          args = a;
          return statement;
        },
        run,
        first,
        all,
      };
      return statement;
    },
  };
  return db;
}

const ORIGIN = 'https://wvytz.github.io';
const envWith = (db: ReturnType<typeof fakeDb>, token?: string) => ({ DB: db, ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`, ...(token ? { REPORTS_TOKEN: token } : {}) });
const body = (over: Record<string, unknown> = {}) => ({ v: 1, kind: 'diagnostic', client: { id: 'client12345' }, summary: { errors: 1, floor: 2 }, text: 'raport', ...over });
const post = (payload: unknown, headers: Record<string, string> = { Origin: ORIGIN }) =>
  new Request('https://w.example/reports', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...headers }, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });

describe('worker: trasy /reports (krok 57)', () => {
  it('POST z dozwolonej strony: 201 + zapis, nagłówki CORS; metadane do filtrowania w kolumnach', async () => {
    const db = fakeDb();
    const res = await worker.fetch(post(body()), envWith(db));
    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(await res.json()).toMatchObject({ ok: true, id: 1 });
    expect(db.reports[0]).toMatchObject({ kind: 'diagnostic', errors: 1, floor: 2, client_id: 'client12345', text: 'raport' });
    expect(String(db.reports[0]!.ip_hash)).toMatch(/^[0-9a-f]{64}$/); // IP tylko jako skrót
    expect(JSON.stringify(db.reports[0])).not.toContain('1.2.3.4');
  });

  it('obcy Origin = 403 bez zapisu; brak Origin też; zły JSON = 400; zła koperta = 400 z powodem', async () => {
    const db = fakeDb();
    expect((await worker.fetch(post(body(), { Origin: 'https://zly.example' }), envWith(db))).status).toBe(403);
    expect((await worker.fetch(post(body(), {}), envWith(db))).status).toBe(403);
    expect((await worker.fetch(post('{nie json'), envWith(db))).status).toBe(400);
    const bad = await worker.fetch(post(body({ kind: 'x' })), envWith(db));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ reason: 'unknown kind' });
    expect(db.reports).toHaveLength(0);
  });

  it('zbyt duża treść: 413 jeszcze przed parsowaniem (nagłówek) i po wczytaniu', async () => {
    const db = fakeDb();
    const declared = await worker.fetch(post(body(), { Origin: ORIGIN, 'Content-Length': String(REPORT_LIMITS.maxBodyChars * 5) }), envWith(db));
    expect(declared.status).toBe(413);
    const raw = JSON.stringify(body({ text: 'x'.repeat(REPORT_LIMITS.maxBodyChars + 10_000) }));
    expect((await worker.fetch(post(raw), envWith(db))).status).toBe(413);
    expect(db.reports).toHaveLength(0);
  });

  it('limit z adresu: po przekroczeniu 429 z Retry-After; duplikat = 200 bez zapisu', async () => {
    const db = fakeDb();
    const env = envWith(db);
    for (let i = 0; i < REPORT_LIMITS.perIpHour; i++) expect((await worker.fetch(post(body({ text: `r${i}` })), env)).status).toBe(201);
    const limited = await worker.fetch(post(body({ text: 'jeszcze jeden' })), env);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('3600');
    const dup = await worker.fetch(post(body({ text: 'r0' })), env);
    expect(dup.status).toBe(200);
    expect(await dup.json()).toMatchObject({ duplicate: true });
    expect(db.reports).toHaveLength(REPORT_LIMITS.perIpHour);
  });

  it('odczyt tylko z sekretem: bez tokena i z błędnym 404, bez skonfigurowanego sekretu 404; z tokenem lista, pełny wpis, usuwanie', async () => {
    const db = fakeDb();
    await worker.fetch(post(body({ text: 'pierwszy', attachments: [{ name: 'i.json', type: 'input-recording', data: '{}' }] })), envWith(db));
    const get = (path: string, token?: string, method = 'GET') =>
      new Request(`https://w.example${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    expect((await worker.fetch(get('/reports'), envWith(db, 'tajny'))).status).toBe(404);
    expect((await worker.fetch(get('/reports', 'zly'), envWith(db, 'tajny'))).status).toBe(404);
    const viaHeader = await worker.fetch(new Request('https://w.example/reports', { headers: { 'X-Reports-Token': 'tajny' } }), envWith(db, 'tajny'));
    expect(viaHeader.status).toBe(200); // alternatywny nagłówek (gdy pośrednik nadpisuje Authorization)
    const overridden = await worker.fetch(new Request('https://w.example/reports', { headers: { Authorization: 'Bearer cudzy', 'X-Reports-Token': 'tajny' } }), envWith(db, 'tajny'));
    expect(overridden.status).toBe(200); // X-Reports-Token ma pierwszeństwo przed cudzym Authorization
    expect((await worker.fetch(get('/reports', 'tajny'), envWith(db))).status).toBe(404); // brak REPORTS_TOKEN
    const list = await worker.fetch(get('/reports?limit=5', 'tajny'), envWith(db, 'tajny'));
    expect(list.status).toBe(200);
    const rows = (await list.json()) as Row[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('text'); // lista bez ciężkiej treści
    const full = await worker.fetch(get('/reports/1', 'tajny'), envWith(db, 'tajny'));
    const detail = (await full.json()) as Row;
    expect(detail.text).toBe('pierwszy');
    expect(detail.attachments).toEqual([{ name: 'i.json', type: 'input-recording', data: '{}' }]);
    expect(detail).not.toHaveProperty('ip_hash');
    expect((await worker.fetch(get('/reports/1', 'tajny', 'DELETE'), envWith(db, 'tajny'))).status).toBe(200);
    expect(db.reports).toHaveLength(0);
    expect((await worker.fetch(get('/reports/1', 'tajny'), envWith(db, 'tajny'))).status).toBe(404);
  });

  it('cron usuwa zgłoszenia starsze niż retencja; trasy wyników działają jak dawniej', async () => {
    const db = fakeDb();
    db.reports.push({ id: 1, created_at: Date.now() - 40 * 24 * 3600 * 1000 }, { id: 2, created_at: Date.now() - 1000 });
    await worker.scheduled({}, envWith(db));
    expect(db.reports.map((r) => r.id)).toEqual([2]);
    const unknown = await worker.fetch(new Request('https://w.example/nieznane'), envWith(db));
    expect(unknown.status).toBe(404);
  });
});

describe('worker: bezpiecznik dobowy wyników', () => {
  /** Atrapa D1 tylko dla `scores`: licznik wpisów z ostatniej doby i wstawianie. */
  function scoresDb(inDay: number) {
    const inserted: unknown[][] = [];
    return {
      inserted,
      prepare(sql: string) {
        let args: unknown[] = [];
        const st = {
          bind(...a: unknown[]) {
            args = a;
            return st;
          },
          async first() {
            if (!sql.includes('COUNT(*)')) return null;
            return { n: sql.includes('ip_hash') ? 0 : inDay };
          },
          async run() {
            if (sql.startsWith('INSERT INTO scores')) inserted.push(args);
            return { meta: {} };
          },
          async all() {
            return { results: [] };
          },
        };
        return st;
      },
    };
  }
  const postScore = () =>
    new Request('https://w.example/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ score: 100, floor: 2, timestamp: Date.now() }),
    });

  it('poniżej progu zapisuje wynik (201)', async () => {
    const db = scoresDb(499);
    const res = await worker.fetch(postScore(), { DB: db, ALLOWED_ORIGINS: ORIGIN });
    expect(res.status).toBe(201);
    expect(db.inserted).toHaveLength(1);
  });

  it('po osiągnięciu progu 503 z Retry-After i bez zapisu', async () => {
    const db = scoresDb(500);
    const res = await worker.fetch(postScore(), { DB: db, ALLOWED_ORIGINS: ORIGIN });
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect(db.inserted).toHaveLength(0);
  });
});

describe('worker: bohater przy wpisie (krok 89)', () => {
  const now = 1_800_000_000_000;
  const entry = (over: Record<string, unknown> = {}) => ({ score: 10, floor: 2, timestamp: now, ...over });

  it('przyjmuje znanego bohatera i wpis bez bohatera (zgodność ze starą grą)', () => {
    expect(validate(entry({ hero: 'archer' }), now)).toEqual({ score: 10, floor: 2, timestamp: now, name: null, hero: 'archer' });
    expect(validate(entry({ name: 'Wicio', hero: 'sorceress' }), now)?.hero).toBe('sorceress');
    expect(validate(entry(), now)?.hero).toBeNull();
    expect(validate(entry({ hero: null }), now)?.hero).toBeNull();
  });

  it('odrzuca bohatera o złym kształcie', () => {
    for (const hero of ['', 'Archer', 'łucznik', 'a'.repeat(17), 5, { id: 'archer' }]) {
      expect(validate(entry({ hero }), now)).toBeNull();
    }
  });

  it('zapisuje bohatera w bazie', async () => {
    const inserted: unknown[][] = [];
    const db = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const st = {
          bind(...a: unknown[]) {
            args = a;
            return st;
          },
          first: async () => ({ n: 0 }),
          async run() {
            if (sql.startsWith('INSERT INTO scores')) inserted.push(args);
            return { meta: {} };
          },
          all: async () => ({ results: [] }),
        };
        return st;
      },
    };
    const res = await worker.fetch(
      new Request('https://w.example/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ score: 5, floor: 1, timestamp: Date.now(), hero: 'barbarian' }),
      }),
      { DB: db, ALLOWED_ORIGINS: ORIGIN },
    );
    expect(res.status).toBe(201);
    expect(inserted[0]?.[4]).toBe('barbarian');
  });
});

describe('worker: tablica aren bossów (krok 91a)', () => {
  /** Atrapa D1 zapamiętująca zapytania — sprawdza, że trasa aren trafia do własnej tabeli i kolejności. */
  function recordingDb() {
    const queries: string[] = [];
    const inserted: Array<{ sql: string; args: unknown[] }> = [];
    return {
      queries,
      inserted,
      prepare(sql: string) {
        queries.push(sql);
        let args: unknown[] = [];
        const st = {
          bind(...a: unknown[]) {
            args = a;
            return st;
          },
          first: async () => ({ n: 0 }),
          async run() {
            if (sql.startsWith('INSERT')) inserted.push({ sql, args });
            return { meta: {} };
          },
          all: async () => ({ results: [{ score: 40, floor: 5, timestamp: 1, name: 'Wicio', hero: 'archer' }] }),
        };
        return st;
      },
    };
  }

  it('GET czyta tabelę aren w kolejności: arena, potem złoto', async () => {
    const db = recordingDb();
    const res = await worker.fetch(new Request('https://w.example/arena-scores?limit=5', { headers: { Origin: ORIGIN } }), { DB: db, ALLOWED_ORIGINS: ORIGIN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ score: 40, floor: 5, timestamp: 1, name: 'Wicio', hero: 'archer' }]);
    expect(db.queries[0]).toContain('FROM arena_scores ORDER BY floor DESC, score DESC');
  });

  it('POST zapisuje do tabeli aren, a limity liczy osobno; wspinaczka bez zmian', async () => {
    const db = recordingDb();
    const send = (path: string) =>
      worker.fetch(
        new Request(`https://w.example${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
          body: JSON.stringify({ score: 40, floor: 5, timestamp: Date.now(), name: 'Wicio', hero: 'archer' }),
        }),
        { DB: db, ALLOWED_ORIGINS: ORIGIN },
      );
    expect((await send('/arena-scores')).status).toBe(201);
    expect((await send('/scores')).status).toBe(201);
    expect(db.inserted.map((i) => i.sql.split(' ')[2])).toEqual(['arena_scores', 'scores']);
    expect(db.queries.filter((q) => q.includes('COUNT(*)') && q.includes('arena_scores'))).toHaveLength(2);
  });
});
