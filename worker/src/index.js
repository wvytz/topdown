/**
 * Worker wspólnej listy wyników Tower Crawlera.
 *   GET  /scores?limit=N  → [{ score, floor, timestamp }], najlepsze pierwsze
 *   POST /scores          ← { score, floor, timestamp }
 * Wynik liczy klient, więc da się go sfałszować; worker odsiewa tylko oczywiste bzdury i zalew wpisów.
 */

// Granice sensownego wpisu — luźne, żeby nie odrzucać prawdziwych runów.
const MAX_SCORE = 1_000_000;
const MAX_FLOOR = 100;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_LIMIT = 100;
// Ochrona przed zalewem: tyle wpisów z jednego adresu w oknie czasu.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname !== '/scores') return json({ error: 'not found' }, 404, cors);

    try {
      if (request.method === 'GET') return await getScores(url, env, cors);
      if (request.method === 'POST') return await postScore(request, env, cors);
      return json({ error: 'method not allowed' }, 405, cors);
    } catch {
      return json({ error: 'server error' }, 500, cors);
    }
  },
};

async function getScores(url, env, cors) {
  const requested = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : 50;
  const { results } = await env.DB.prepare(
    'SELECT score, floor, timestamp FROM scores ORDER BY score DESC, floor DESC, id ASC LIMIT ?',
  )
    .bind(limit)
    .all();
  return json(results, 200, { ...cors, 'Cache-Control': 'no-store' });
}

async function postScore(request, env, cors) {
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
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') ?? 'unknown');
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, now - RATE_WINDOW_MS)
    .first();
  if ((recent?.n ?? 0) >= RATE_LIMIT) return json({ error: 'too many requests' }, 429, cors);

  await env.DB.prepare('INSERT INTO scores (score, floor, timestamp, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(entry.score, entry.floor, entry.timestamp, ipHash, now)
    .run();
  return json({ ok: true }, 201, cors);
}

export function validate(body, now) {
  if (typeof body !== 'object' || body === null) return null;
  const { score, floor, timestamp } = body;
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return null;
  if (!Number.isInteger(floor) || floor < 1 || floor > MAX_FLOOR) return null;
  if (!Number.isInteger(timestamp) || Math.abs(timestamp - now) > MAX_CLOCK_SKEW_MS) return null;
  return { score, floor, timestamp };
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return origin !== null && allowedOrigins(env).includes(origin);
}

function corsHeaders(request, env) {
  const headers = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  if (originAllowed(request, env)) headers['Access-Control-Allow-Origin'] = request.headers.get('Origin');
  return headers;
}

/** Adres IP trzymamy tylko jako skrót — do limitu wpisów, nie do identyfikacji. */
async function hashIp(ip) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tower-crawler:${ip}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
