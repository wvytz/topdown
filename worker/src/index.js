/**
 * Worker Tower Crawlera: wspólna lista wyników i zgłoszenia diagnostyczne.
 *   GET    /scores?limit=N  → [{ score, floor, timestamp, name, hero }], najlepsze pierwsze (name i hero mogą być null)
 *   POST   /scores          ← { score, floor, timestamp, name?, hero? }
 *   GET    /arena-scores?limit=N  → tablica aren bossów (krok 91a): floor = osiągnięta arena, ranking najpierw arena, potem złoto
 *   POST   /arena-scores          ← jak /scores
 *   GET    /coop-scores?limit=N   → tablica co-op (krok 108): jak /scores, z bohaterem P2 w polu `partner`
 *   POST   /coop-scores           ← { score, floor, timestamp, name?, hero?, partner? }
 *   POST   /reports         ← koperta zgłoszenia (patrz `reports.js`); 201 { ok, id } | 200 { duplicate } | 400/413/429/503
 *   GET    /reports?limit&kind&since&floor  → lista metadanych       } tylko z nagłówkiem Authorization: Bearer <REPORTS_TOKEN>
 *   GET    /reports/:id                     → pełne zgłoszenie       } albo X-Reports-Token: <REPORTS_TOKEN>
 *   DELETE /reports/:id                     → usunięcie              } (bez sekretu te trasy zwracają 404)
 *   cron (codziennie)       → usuwa zgłoszenia starsze niż REPORT_LIMITS.retentionDays
 * Wynik liczy klient, więc da się go sfałszować; worker odsiewa tylko oczywiste bzdury i zalew wpisów.
 */
import { REPORT_LIMITS, processReport, retentionCutoff, sha256Hex, tokensEqual } from './reports.js';

// Granice sensownego wpisu — luźne, żeby nie odrzucać prawdziwych runów.
const MAX_SCORE = 1_000_000;
const MAX_FLOOR = 100;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_LIMIT = 100;
const MAX_NAME_LENGTH = 12;
// Bohater (krok 89): identyfikator `HeroId` z gry; wzorzec zamiast listy, żeby nowy bohater nie wymagał wdrożenia workera.
const HERO_PATTERN = /^[a-z_]{1,16}$/;
// Ochrona przed zalewem: tyle wpisów z jednego adresu w oknie czasu.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;
// Globalny bezpiecznik dobowy: chroni darmowy limit zapisów D1 (wspólny ze zgłoszeniami) przed zalewem z wielu adresów.
const MAX_SCORES_PER_DAY = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tablice wyników: trasa → tabela i kolejność. Wspinaczka: złoto, potem piętro. Areny bossów (krok 91a): osiągnięta
 * arena, potem złoto. Każda tablica ma własne limity (zalew jednej nie blokuje drugiej).
 */
const SCORE_BOARDS = {
  '/scores': { table: 'scores', order: 'score DESC, floor DESC, id ASC' },
  '/arena-scores': { table: 'arena_scores', order: 'floor DESC, score DESC, id ASC' },
  // Co-op (krok 108): wynik drużyny = wspólne złoto; `partner` — bohater P2.
  '/coop-scores': { table: 'coop_scores', order: 'score DESC, floor DESC, id ASC', partner: true },
};

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      const board = SCORE_BOARDS[url.pathname];
      if (board) {
        if (request.method === 'GET') return await getScores(url, env, cors, board);
        if (request.method === 'POST') return await postScore(request, env, cors, board);
        return json({ error: 'method not allowed' }, 405, cors);
      }
      const reportPath = /^\/reports(?:\/(\d+))?$/.exec(url.pathname);
      if (reportPath) return await routeReports(request, url, reportPath[1], env, cors);
      return json({ error: 'not found' }, 404, cors);
    } catch {
      return json({ error: 'server error' }, 500, cors);
    }
  },

  /** Cron: usuwanie starych zgłoszeń (retencja). */
  async scheduled(_event, env) {
    await purgeOldReports(env, Date.now());
  },
};

// ---------------------------------------------------------------- zgłoszenia diagnostyczne

async function routeReports(request, url, idText, env, cors) {
  if (request.method === 'POST' && idText === undefined) return await postReport(request, env, cors);
  // Reszta to trasy administratora: bez skonfigurowanego sekretu nie istnieją, bez poprawnego tokena — 404 (nie zdradzamy ich).
  // Token: `Authorization: Bearer <token>` albo `X-Reports-Token: <token>` (gdy pośrednik nadpisuje Authorization).
  // `X-Reports-Token` ma pierwszeństwo: pośrednik (proxy, narzędzia) może dopisać własny Authorization.
  const header = request.headers.get('Authorization') ?? '';
  const token = request.headers.get('X-Reports-Token') ?? (header.startsWith('Bearer ') ? header.slice(7) : '');
  if (!(await tokensEqual(token, env.REPORTS_TOKEN))) return json({ error: 'not found' }, 404, cors);
  if (request.method === 'GET' && idText === undefined) return await listReports(url, env);
  if (request.method === 'GET') return await getReport(Number(idText), env);
  if (request.method === 'DELETE' && idText !== undefined) {
    await env.DB.prepare('DELETE FROM reports WHERE id = ?').bind(Number(idText)).run();
    return json({ ok: true }, 200, {});
  }
  return json({ error: 'method not allowed' }, 405, cors);
}

async function postReport(request, env, cors) {
  if (!originAllowed(request, env)) return json({ error: 'origin not allowed' }, 403, cors);
  // Odrzucamy zbyt duże zgłoszenia, zanim wczytamy treść do pamięci.
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  const maxBytes = REPORT_LIMITS.maxBodyChars * 4;
  if (declared > maxBytes) return json({ error: 'payload too large' }, 413, cors);
  const raw = await request.text();
  if (raw.length > REPORT_LIMITS.maxBodyChars + 4096) return json({ error: 'payload too large' }, 413, cors);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad json' }, 400, cors);
  }
  const now = Date.now();
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') ?? 'unknown', env);
  const result = await processReport({ body, ipHash, now, repo: d1Repo(env), limits: REPORT_LIMITS });
  // Sprzątanie przy okazji zapisu (co ok. 50. zgłoszenie) — obok codziennego crona.
  if (result.status === 201 && Math.random() < 0.02) await purgeOldReports(env, now);
  return json(result.body, result.status, { ...cors, ...(result.headers ?? {}) });
}

function d1Repo(env) {
  return {
    async countByIp(ipHash, since) {
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE ip_hash = ? AND created_at > ?').bind(ipHash, since).first();
      return row?.n ?? 0;
    },
    async countAll(since) {
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE created_at > ?').bind(since).first();
      return row?.n ?? 0;
    },
    async findDuplicate(clientId, textHash, since) {
      const row = await env.DB.prepare('SELECT 1 AS x FROM reports WHERE client_id = ? AND text_hash = ? AND created_at > ? LIMIT 1')
        .bind(clientId, textHash, since)
        .first();
      return row !== null && row !== undefined;
    },
    async insert(r) {
      const result = await env.DB.prepare(
        'INSERT INTO reports (created_at, ip_hash, schema_version, kind, build, client_id, session_id, errors, warnings, floor, hero, seed, abnormal_prev, text_hash, size, text, attachments) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(
          r.createdAt, r.ipHash, r.version, r.kind, r.build, r.clientId, r.sessionId,
          r.summary.errors ?? null, r.summary.warnings ?? null, r.summary.floor ?? null, r.summary.hero ?? null, r.summary.seed ?? null,
          r.summary.abnormalPrev === undefined ? null : r.summary.abnormalPrev ? 1 : 0,
          r.textHash, r.size, r.text, r.attachments.length > 0 ? JSON.stringify(r.attachments) : null,
        )
        .run();
      return result.meta?.last_row_id ?? 0;
    },
  };
}

async function purgeOldReports(env, now) {
  await env.DB.prepare('DELETE FROM reports WHERE created_at < ?').bind(retentionCutoff(now, REPORT_LIMITS)).run();
}

async function listReports(url, env) {
  const requested = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), REPORT_LIMITS.maxListLimit) : 50;
  const conditions = [];
  const params = [];
  const kind = url.searchParams.get('kind');
  if (kind) {
    conditions.push('kind = ?');
    params.push(kind);
  }
  const since = Number.parseInt(url.searchParams.get('since') ?? '', 10);
  if (Number.isFinite(since)) {
    conditions.push('created_at > ?');
    params.push(since);
  }
  const floor = Number.parseInt(url.searchParams.get('floor') ?? '', 10);
  if (Number.isFinite(floor)) {
    conditions.push('floor = ?');
    params.push(floor);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, kind, build, client_id, session_id, errors, warnings, floor, hero, seed, abnormal_prev, size FROM reports ${where} ORDER BY id DESC LIMIT ?`,
  )
    .bind(...params, limit)
    .all();
  return json(results, 200, { 'Cache-Control': 'no-store' });
}

async function getReport(id, env) {
  const row = await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not found' }, 404, {});
  const { ip_hash: _ip, ...rest } = row;
  return json({ ...rest, attachments: rest.attachments ? JSON.parse(rest.attachments) : [] }, 200, { 'Cache-Control': 'no-store' });
}

// ---------------------------------------------------------------- wyniki

async function getScores(url, env, cors, board) {
  const requested = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : 50;
  const { results } = await env.DB.prepare(
    `SELECT score, floor, timestamp, name, hero${board.partner ? ', partner' : ''} FROM ${board.table} ORDER BY ${board.order} LIMIT ?`,
  )
    .bind(limit)
    .all();
  return json(results, 200, { ...cors, 'Cache-Control': 'no-store' });
}

async function postScore(request, env, cors, board) {
  if (!originAllowed(request, env)) return json({ error: 'origin not allowed' }, 403, cors);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad json' }, 400, cors);
  }
  const entry = validate(body, Date.now());
  if (!entry) return json({ error: 'invalid entry' }, 400, cors);

  const now = Date.now();
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') ?? 'unknown', env);
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${board.table} WHERE ip_hash = ? AND created_at > ?`)
    .bind(ipHash, now - RATE_WINDOW_MS)
    .first();
  if ((recent?.n ?? 0) >= RATE_LIMIT) return json({ error: 'too many requests' }, 429, cors);

  const today = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${board.table} WHERE created_at > ?`).bind(now - DAY_MS).first();
  if ((today?.n ?? 0) >= MAX_SCORES_PER_DAY) return json({ error: 'daily cap reached' }, 503, { ...cors, 'Retry-After': '3600' });

  const insert = board.partner
    ? env.DB.prepare(`INSERT INTO ${board.table} (score, floor, timestamp, name, hero, partner, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        entry.score,
        entry.floor,
        entry.timestamp,
        entry.name,
        entry.hero,
        entry.partner,
        ipHash,
        now,
      )
    : env.DB.prepare(`INSERT INTO ${board.table} (score, floor, timestamp, name, hero, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
        entry.score,
        entry.floor,
        entry.timestamp,
        entry.name,
        entry.hero,
        ipHash,
        now,
      );
  await insert.run();
  return json({ ok: true }, 201, cors);
}

export function validate(body, now) {
  if (typeof body !== 'object' || body === null) return null;
  const { score, floor, timestamp, name, hero, partner } = body;
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return null;
  if (!Number.isInteger(floor) || floor < 1 || floor > MAX_FLOOR) return null;
  if (!Number.isInteger(timestamp) || Math.abs(timestamp - now) > MAX_CLOCK_SKEW_MS) return null;
  // Bohater opcjonalny (starsze wersje gry go nie wysyłają).
  const heroOk = hero === undefined || hero === null || (typeof hero === 'string' && HERO_PATTERN.test(hero));
  if (!heroOk) return null;
  const heroValue = hero ?? null;
  // Bohater P2 (tablica co-op, krok 108) — opcjonalny, ten sam wzorzec.
  const partnerOk = partner === undefined || partner === null || (typeof partner === 'string' && HERO_PATTERN.test(partner));
  if (!partnerOk) return null;
  const partnerValue = partner ?? null;
  if (name === undefined || name === null || name === '') return { score, floor, timestamp, name: null, hero: heroValue, partner: partnerValue };
  // Te same zasady co w grze (sanitizePlayerName): litery, cyfry, spacja, „_”, „-”, max 12 znaków.
  if (typeof name !== 'string' || name !== name.trim() || /\s{2,}/.test(name)) return null;
  if (!/^[\p{L}\p{N} _-]+$/u.test(name) || [...name].length > MAX_NAME_LENGTH) return null;
  return { score, floor, timestamp, name, hero: heroValue, partner: partnerValue };
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return origin !== null && allowedOrigins(env).includes(origin);
}

function corsHeaders(request, env) {
  const headers = { 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  if (originAllowed(request, env)) headers['Access-Control-Allow-Origin'] = request.headers.get('Origin');
  return headers;
}

/**
 * Adres IP trzymamy tylko jako skrót — do limitu wpisów, nie do identyfikacji.
 * Sól `IP_SALT` (sekret: `npx wrangler secret put IP_SALT`) uniemożliwia odtworzenie adresów z bazy:
 * bez niej skrót z publicznego kodu da się policzyć dla każdego adresu IPv4.
 */
async function hashIp(ip, env) {
  return sha256Hex(`tower-crawler:${env.IP_SALT ?? ''}:${ip}`);
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
