/**
 * Zgłoszenia diagnostyczne z gry (krok 57): walidacja, limity i logika przyjęcia — bez zależności od Cloudflare,
 * żeby dało się ją testować w Vitest (`tests/worker/reports.test.ts`). Adapter bazy D1 i routing są w `index.js`.
 *
 * KOPERTA ZGŁOSZENIA (wersja 1) — kontrakt gry i workera, rozszerzalny na bardziej złożone raportowanie:
 *   {
 *     v: 1,
 *     kind: 'diagnostic' | 'crash' | 'feedback',     // rodzaj; lista w REPORT_LIMITS.kinds
 *     app:    { build?: string },                     // wersja/tryb budowy gry
 *     client: { id?: string, sessionId?: string, name?: string },  // anonimowy identyfikator przeglądarki i sesji; imię z tablicy wyników (krok 133)
 *     summary: { errors?, warnings?, floor?, hero?, seed?, abnormalPrev? },  // pola do filtrowania w bazie
 *     text: string,                                   // raport tekstowy (F9) albo wiadomość z czatu „Napisz do autora” (krok 133)
 *     attachments?: [{ name, type: 'input-recording' | 'json' | 'text', data: string }]
 *   }
 * Nieznane pola są ignorowane (zgodność w przód); nowsza wersja `v` jest odrzucana (400 „unsupported version”).
 */

export const REPORT_LIMITS = {
  /** Obsługiwana wersja koperty. */
  version: 1,
  /** Rodzaje zgłoszeń (nowy rodzaj = dopisanie tutaj i wdrożenie workera). */
  kinds: ['diagnostic', 'crash', 'feedback'],
  attachmentTypes: ['input-recording', 'json', 'text'],
  /** Twardy limit całej treści (znaki) i jego składowych. */
  maxBodyChars: 262_144,
  maxTextChars: 80_000,
  maxAttachments: 2,
  maxAttachmentChars: 150_000,
  /** Limity z jednego adresu IP (skrót): na godzinę i na dobę. */
  perIpHour: 5,
  perIpDay: 20,
  /** Globalny bezpiecznik dobowy (chroni darmowy limit zapisów w D1 przed zalewem z wielu adresów). */
  globalDay: 1000,
  /** Identyczna treść od tego samego klienta w tym oknie nie jest zapisywana ponownie. */
  dedupeWindowMs: 24 * 60 * 60 * 1000,
  /** Zgłoszenia starsze niż tyle dni są usuwane (cron codzienny i przy odczycie listy). */
  retentionDays: 30,
  /**
   * Krok 133: wiadomości z czatu „Napisz do autora” (`feedback`) zostają na zawsze — są podstawą ukrytej tablicy
   * współtwórców — i mają własne, luźniejsze limity (krótkie wiadomości, nie raporty diagnostyczne).
   */
  persistentKinds: ['feedback'],
  feedbackPerIpHour: 12,
  feedbackPerIpDay: 40,
  /** Gwiazdki autora za ciekawą wiadomość: 0–maxStars. */
  maxStars: 3,
  /** Maksymalna liczba wierszy w odpowiedzi listy dla administratora. */
  maxListLimit: 100,
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const isStr = (s, max) => typeof s === 'string' && s.length <= max;

/** Imię gracza — te same zasady co na tablicy wyników (`validate` w index.js, `sanitizePlayerName` w grze). */
export function isPlayerName(name) {
  return (
    typeof name === 'string' && name === name.trim() && !/\s{2,}/.test(name) && /^[\p{L}\p{N} _-]+$/u.test(name) && [...name].length <= 12
  );
}

/** Walidacja i normalizacja koperty: zwraca `{ ok: true, report }` albo `{ ok: false, reason }` (kod do odpowiedzi 400). */
export function validateReport(body, limits = REPORT_LIMITS) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, reason: 'not an object' };
  if (!Number.isInteger(body.v)) return { ok: false, reason: 'missing version' };
  if (body.v !== limits.version) return { ok: false, reason: 'unsupported version' };
  if (typeof body.kind !== 'string' || !limits.kinds.includes(body.kind)) return { ok: false, reason: 'unknown kind' };

  const app = body.app ?? {};
  const client = body.client ?? {};
  const summary = body.summary ?? {};
  if ([app, client, summary].some((o) => typeof o !== 'object' || o === null || Array.isArray(o))) return { ok: false, reason: 'bad section' };

  if (app.build !== undefined && !(isStr(app.build, 40) && /^[\w.+\- ]*$/.test(app.build))) return { ok: false, reason: 'bad build' };
  if (client.id !== undefined && !(isStr(client.id, 64) && /^[A-Za-z0-9-]{1,64}$/.test(client.id))) return { ok: false, reason: 'bad client id' };
  if (client.sessionId !== undefined && !(isStr(client.sessionId, 40) && /^[A-Za-z0-9-]{1,40}$/.test(client.sessionId))) return { ok: false, reason: 'bad session id' };
  if (client.name !== undefined && client.name !== null && client.name !== '' && !isPlayerName(client.name)) return { ok: false, reason: 'bad player name' };

  const s = {};
  if (summary.errors !== undefined) {
    if (!isInt(summary.errors, 0, 1_000_000)) return { ok: false, reason: 'bad summary.errors' };
    s.errors = summary.errors;
  }
  if (summary.warnings !== undefined) {
    if (!isInt(summary.warnings, 0, 1_000_000)) return { ok: false, reason: 'bad summary.warnings' };
    s.warnings = summary.warnings;
  }
  if (summary.floor !== undefined) {
    if (!isInt(summary.floor, 1, 100)) return { ok: false, reason: 'bad summary.floor' };
    s.floor = summary.floor;
  }
  if (summary.hero !== undefined) {
    if (!(isStr(summary.hero, 24) && /^[\w-]*$/.test(summary.hero))) return { ok: false, reason: 'bad summary.hero' };
    s.hero = summary.hero;
  }
  if (summary.seed !== undefined) {
    if (!isInt(summary.seed, 0, 4_294_967_295)) return { ok: false, reason: 'bad summary.seed' };
    s.seed = summary.seed;
  }
  if (summary.abnormalPrev !== undefined) {
    if (typeof summary.abnormalPrev !== 'boolean') return { ok: false, reason: 'bad summary.abnormalPrev' };
    s.abnormalPrev = summary.abnormalPrev;
  }

  if (typeof body.text !== 'string' || body.text.length === 0) return { ok: false, reason: 'missing text' };
  if (body.text.length > limits.maxTextChars) return { ok: false, reason: 'text too long' };

  const attachments = [];
  if (body.attachments !== undefined) {
    if (!Array.isArray(body.attachments) || body.attachments.length > limits.maxAttachments) return { ok: false, reason: 'too many attachments' };
    for (const a of body.attachments) {
      if (typeof a !== 'object' || a === null) return { ok: false, reason: 'bad attachment' };
      if (!(isStr(a.name, 40) && /^[\w.\- ]{1,40}$/.test(a.name))) return { ok: false, reason: 'bad attachment name' };
      if (!limits.attachmentTypes.includes(a.type)) return { ok: false, reason: 'bad attachment type' };
      if (typeof a.data !== 'string' || a.data.length > limits.maxAttachmentChars) return { ok: false, reason: 'attachment too long' };
      attachments.push({ name: a.name, type: a.type, data: a.data });
    }
  }

  const size = body.text.length + attachments.reduce((n, a) => n + a.data.length, 0);
  if (size > limits.maxBodyChars) return { ok: false, reason: 'report too large' };

  return {
    ok: true,
    report: {
      version: body.v,
      kind: body.kind,
      build: app.build ?? null,
      clientId: client.id ?? 'anon',
      sessionId: client.sessionId ?? null,
      playerName: client.name ? client.name : null,
      summary: s,
      text: body.text,
      attachments,
      size,
    },
  };
}

/**
 * Decyzja o limitach: null = można przyjąć; inaczej `{ status, reason, retryAfterS }`. Wiadomości z czatu (`feedback`)
 * liczą się osobno od raportów diagnostycznych i mają własne limity z adresu (krok 133).
 */
export function decideQuota({ ipHour, ipDay, globalDay }, limits = REPORT_LIMITS, feedback = false) {
  const perHour = feedback ? limits.feedbackPerIpHour : limits.perIpHour;
  const perDay = feedback ? limits.feedbackPerIpDay : limits.perIpDay;
  if (globalDay >= limits.globalDay) return { status: 503, reason: 'daily cap reached', retryAfterS: 3600 };
  if (ipHour >= perHour) return { status: 429, reason: 'too many reports (hour)', retryAfterS: 3600 };
  if (ipDay >= perDay) return { status: 429, reason: 'too many reports (day)', retryAfterS: 6 * 3600 };
  return null;
}

/** Czy zgłoszenie tego rodzaju to wiadomość z czatu (osobne limity, bez retencji, tablica współtwórców). */
export const isFeedbackKind = (kind, limits = REPORT_LIMITS) => limits.persistentKinds.includes(kind);

/** Gwiazdki autora (krok 133): liczba całkowita 0–maxStars albo null, gdy wartość jest zła. */
export function parseStars(value, limits = REPORT_LIMITS) {
  return Number.isInteger(value) && value >= 0 && value <= limits.maxStars ? value : null;
}

/** Skrót SHA-256 (hex) — do deduplikacji treści i anonimizacji IP. */
export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Przyjęcie zgłoszenia: walidacja → deduplikacja → limity → zapis. `repo` to adapter bazy:
 *   countByIp(ipHash, since, feedback) → liczba zgłoszeń z adresu od `since` (wiadomości z czatu albo pozostałe)
 *   countAll(since)          → liczba wszystkich zgłoszeń od `since`
 *   findDuplicate(clientId, textHash, since) → boolean
 *   insert(row)              → id nowego wiersza
 *   bumpContributor({ clientId, name, feedback, now }) → licznik zgłoszeń testera (ukryta tablica współtwórców, krok 133)
 * Zwraca `{ status, body, headers? }` do wysłania klientowi. Deduplikacja jest przed limitami: ponowienie wysyłki
 * tego samego raportu jest bezkosztowe i nie zużywa limitu.
 */
export async function processReport({ body, ipHash, now, repo, limits = REPORT_LIMITS }) {
  const checked = validateReport(body, limits);
  if (!checked.ok) return { status: 400, body: { error: 'invalid report', reason: checked.reason } };
  const { report } = checked;

  const textHash = await sha256Hex(`${report.kind}\n${report.text}`);
  if (await repo.findDuplicate(report.clientId, textHash, now - limits.dedupeWindowMs)) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  const feedback = isFeedbackKind(report.kind, limits);
  const quota = decideQuota(
    {
      ipHour: await repo.countByIp(ipHash, now - HOUR_MS, feedback),
      ipDay: await repo.countByIp(ipHash, now - DAY_MS, feedback),
      globalDay: await repo.countAll(now - DAY_MS),
    },
    limits,
    feedback,
  );
  if (quota) return { status: quota.status, body: { error: quota.reason }, headers: { 'Retry-After': String(quota.retryAfterS) } };

  const id = await repo.insert({ ...report, ipHash, textHash, createdAt: now });
  // Licznik do ukrytej tablicy współtwórców — tylko dla przeglądarek z identyfikatorem (bez niego nie wiadomo, kto pisał).
  if (report.clientId !== 'anon') await repo.bumpContributor({ clientId: report.clientId, name: report.playerName, feedback, now });
  return { status: 201, body: { ok: true, id } };
}

/** Granica retencji: zgłoszenia utworzone przed tą chwilą (ms) trzeba usunąć. */
export function retentionCutoff(now, limits = REPORT_LIMITS) {
  return now - limits.retentionDays * DAY_MS;
}

/** Porównanie tokenów w stałym czasie (przez skróty), żeby nie zdradzać długości wspólnego prefiksu. */
export async function tokensEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || b === '') return false;
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}
