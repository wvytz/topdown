import { describe, expect, it } from 'vitest';
import worker, { validate } from '../../worker/src/index.js';
import { REPORT_LIMITS } from '../../worker/src/reports.js';

/** Minimalna atrapa D1 dla zapytań workera (rozpoznaje je po treści SQL) — sprawdza routing, nagłówki i limity bez Cloudflare. */
type Row = Record<string, unknown>;
function fakeDb() {
  const reports: Row[] = [];
  const contributors = new Map<string, Row>();
  let nextId = 1;
  const db = {
    reports,
    contributors,
    prepare(sql: string) {
      let args: unknown[] = [];
      const run = async () => {
        if (sql.startsWith('INSERT INTO reports')) {
          const [created_at, ip_hash, schema_version, kind, build, client_id, session_id, errors, warnings, floor, hero, seed, abnormal_prev, text_hash, size, text, attachments, player_name] = args;
          const id = nextId++;
          reports.push({ id, created_at, ip_hash, schema_version, kind, build, client_id, session_id, errors, warnings, floor, hero, seed, abnormal_prev, text_hash, size, text, attachments, player_name, stars: 0 });
          return { meta: { last_row_id: id } };
        }
        if (sql.startsWith('INSERT INTO contributors')) {
          const [client_id, name, feedback_count, report_count, first_at, last_at] = args as [string, string | null, number, number, number, number];
          const old = contributors.get(client_id);
          contributors.set(
            client_id,
            old
              ? { ...old, name: name ?? old.name, feedback_count: (old.feedback_count as number) + feedback_count, report_count: (old.report_count as number) + report_count, last_at }
              : { client_id, name, feedback_count, report_count, stars: 0, first_at, last_at },
          );
        }
        if (sql.startsWith('UPDATE reports SET stars')) {
          const row = reports.find((r) => r.id === args[1]);
          if (row) row.stars = args[0];
        }
        if (sql.startsWith('UPDATE contributors SET stars')) {
          const c = contributors.get(args[1] as string);
          if (c) c.stars = reports.filter((r) => r.client_id === args[0]).reduce((n, r) => n + (r.stars as number), 0);
        }
        if (sql.startsWith('DELETE FROM reports WHERE id')) {
          const i = reports.findIndex((r) => r.id === args[0]);
          if (i >= 0) reports.splice(i, 1);
        }
        if (sql.startsWith('DELETE FROM reports WHERE created_at')) {
          const keepFeedback = sql.includes("kind <> 'feedback'");
          for (let i = reports.length - 1; i >= 0; i--) {
            const r = reports[i]!;
            if ((r.created_at as number) < (args[0] as number) && !(keepFeedback && r.kind === 'feedback')) reports.splice(i, 1);
          }
        }
        return { meta: {} };
      };
      const first = async () => {
        if (sql.includes('COUNT(*)') && sql.includes('ip_hash')) {
          return { n: reports.filter((r) => r.ip_hash === args[0] && (r.created_at as number) > (args[1] as number) && (r.kind === 'feedback' ? 1 : 0) === args[2]).length };
        }
        if (sql.startsWith('SELECT client_id FROM reports WHERE id')) {
          const r = reports.find((row) => row.id === args[0]);
          return r ? { client_id: r.client_id } : null;
        }
        if (sql.includes('COUNT(*)')) return { n: reports.filter((r) => (r.created_at as number) > (args[0] as number)).length };
        if (sql.includes('SELECT 1 AS x')) return reports.some((r) => r.client_id === args[0] && r.text_hash === args[1] && (r.created_at as number) > (args[2] as number)) ? { x: 1 } : null;
        if (sql.startsWith('SELECT * FROM reports WHERE id')) return reports.find((r) => r.id === args[0]) ?? null;
        return null;
      };
      const all = async () => {
        if (sql.includes('FROM reports') && sql.includes('ORDER BY id DESC')) {
          const limit = args[args.length - 1] as number;
          const kind = sql.includes('kind = ?') ? args[0] : null;
          return {
            results: [...reports]
              .reverse()
              .filter((r) => kind === null || r.kind === kind)
              .slice(0, limit)
              .map(({ text, attachments: _a, ip_hash: _i, text_hash: _h, ...meta }) => ({ ...meta, preview: String(text).slice(0, 700) })),
          };
        }
        if (sql.includes('FROM contributors')) {
          return { results: [...contributors.values()].sort((a, b) => (b.stars as number) - (a.stars as number) || (b.feedback_count as number) - (a.feedback_count as number)) };
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
    expect(rows[0]).not.toHaveProperty('text'); // lista bez ciężkiej treści, tylko początek
    expect(rows[0]!.preview).toBe('pierwszy');
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

describe('worker: czat „Napisz do autora” i współtwórcy (krok 133)', () => {
  const feedback = (text: string, client = 'tester0001', name?: string) =>
    post(body({ kind: 'feedback', text, client: { id: client, ...(name !== undefined ? { name } : {}) }, summary: { floor: 3 } }));
  const author = (path: string, init: RequestInit = {}) =>
    new Request(`https://w.example${path}`, { ...init, headers: { 'X-Reports-Token': 'tajny', 'Content-Type': 'application/json' } });

  it('wiadomość zapisuje imię i liczy się do tablicy współtwórców; raport F9 liczy się osobno', async () => {
    const db = fakeDb();
    const env = envWith(db, 'tajny');
    expect((await worker.fetch(feedback('Dodajcie mapę', 'tester0001', 'Wicio'), env)).status).toBe(201);
    expect((await worker.fetch(feedback('I muzykę', 'tester0001'), env)).status).toBe(201);
    expect((await worker.fetch(post(body({ client: { id: 'tester0001' } })), env)).status).toBe(201);
    expect(db.reports[0]).toMatchObject({ kind: 'feedback', player_name: 'Wicio' });
    expect(db.contributors.get('tester0001')).toMatchObject({ name: 'Wicio', feedback_count: 2, report_count: 1, stars: 0 });
    // Złe imię = 400 (te same zasady co na tablicy wyników).
    expect((await worker.fetch(feedback('x', 'tester0002', '<b>'), env)).status).toBe(400);
  });

  it('gwiazdki autora: PATCH tylko z tokenem, 0–3; suma w tablicy współtwórców; usunięcie wiadomości ją przelicza', async () => {
    const db = fakeDb();
    const env = envWith(db, 'tajny');
    await worker.fetch(feedback('Pomysł A', 'tester0001', 'Ala'), env);
    await worker.fetch(feedback('Pomysł B', 'tester0001'), env);
    await worker.fetch(feedback('Pomysł C', 'tester0002', 'Olek'), env);
    const rate = (id: number, stars: unknown) => worker.fetch(author(`/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ stars }) }), env);
    expect((await worker.fetch(new Request('https://w.example/reports/1', { method: 'PATCH', body: '{"stars":3}' }), env)).status).toBe(404);
    expect((await rate(1, 4)).status).toBe(400);
    expect((await rate(1, 1.5)).status).toBe(400);
    expect((await rate(99, 1)).status).toBe(404);
    expect((await rate(1, 3)).status).toBe(200);
    expect((await rate(2, 2)).status).toBe(200);
    expect((await rate(3, 1)).status).toBe(200);
    const board = (await (await worker.fetch(author('/contributors'), env)).json()) as Row[];
    expect(board.map((r) => [r.name, r.stars])).toEqual([['Ala', 5], ['Olek', 1]]);
    expect((await worker.fetch(new Request('https://w.example/contributors'), env)).status).toBe(404); // ukryta
    await worker.fetch(author('/reports/2', { method: 'DELETE' }), env);
    expect(db.contributors.get('tester0001')).toMatchObject({ stars: 3, feedback_count: 2 });
    const list = (await (await worker.fetch(author('/reports?kind=feedback'), env)).json()) as Row[];
    expect(list.map((r) => r.preview)).toEqual(['Pomysł C', 'Pomysł A']);
  });

  it('wiadomości mają własny limit z adresu — wyczerpany limit raportów F9 ich nie blokuje', async () => {
    const db = fakeDb();
    const env = envWith(db);
    for (let i = 0; i < REPORT_LIMITS.perIpHour; i++) await worker.fetch(post(body({ text: `r${i}` })), env);
    expect((await worker.fetch(post(body({ text: 'r-extra' })), env)).status).toBe(429);
    for (let i = 0; i < REPORT_LIMITS.feedbackPerIpHour; i++) expect((await worker.fetch(feedback(`uwaga ${i}`), env)).status).toBe(201);
    expect((await worker.fetch(feedback('za dużo'), env)).status).toBe(429);
  });

  it('cron nie usuwa wiadomości z czatu; skrzynka autora to strona HTML bez danych', async () => {
    const db = fakeDb();
    const old = Date.now() - 40 * 24 * 3600 * 1000;
    db.reports.push({ id: 1, created_at: old, kind: 'diagnostic' }, { id: 2, created_at: old, kind: 'feedback' });
    await worker.scheduled({}, envWith(db));
    expect(db.reports.map((r) => r.id)).toEqual([2]);
    const inbox = await worker.fetch(new Request('https://w.example/inbox'), envWith(db, 'tajny'));
    expect(inbox.status).toBe(200);
    expect(inbox.headers.get('Content-Type')).toContain('text/html');
    const html = await inbox.text();
    expect(html).toContain('Skrzynka autora');
    expect(html).not.toContain('tajny');
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
    expect(validate(entry({ hero: 'archer' }), now)).toEqual({ score: 10, floor: 2, timestamp: now, name: null, hero: 'archer', partner: null });
    // Co-op (krok 108): bohater P2 w polu `partner`, ten sam wzorzec co bohater.
    expect(validate(entry({ hero: 'barbarian', partner: 'archer' }), now)?.partner).toBe('archer');
    expect(validate(entry({ partner: 'DROP TABLE' }), now)).toBeNull();
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
