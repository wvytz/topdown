/**
 * Strona „Skrzynka autora” (krok 133) pod `GET /inbox`: wiadomości z czatu „Napisz do autora”, gwiazdki za ciekawe
 * pomysły, ukryta tablica współtwórców i raporty diagnostyczne. Sama strona nic nie zdradza — dane pobiera
 * z tras autora z tokenem `REPORTS_TOKEN`, który autor wpisuje raz (zostaje w localStorage tej przeglądarki).
 * Treść od testerów wstawiamy wyłącznie przez `textContent` (nigdy jako HTML).
 */
export const INBOX_HTML = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Skrzynka autora — TOP DOWN</title>
<style>
  :root { --bg:#14100e; --panel:#1f1916; --line:#3a2e26; --text:#f1e6d2; --dim:#a8998a; --gold:#f0c24a; --red:#ff7a6a; --green:#9be08a; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 system-ui, sans-serif; }
  header { position:sticky; top:0; background:var(--panel); border-bottom:1px solid var(--line); padding:10px 16px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  h1 { font-size:17px; margin:0 12px 0 0; color:var(--gold); }
  button, input { font:inherit; color:var(--text); background:#2c231e; border:1px solid var(--line); border-radius:6px; padding:5px 10px; }
  button { cursor:pointer; }
  button.on { border-color:var(--gold); color:var(--gold); }
  main { max-width:860px; margin:0 auto; padding:16px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:10px 12px; margin-bottom:10px; }
  .meta { color:var(--dim); font-size:13px; display:flex; gap:10px; flex-wrap:wrap; }
  .who { color:var(--gold); }
  .text { white-space:pre-wrap; word-break:break-word; margin:6px 0; }
  .row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  .star { padding:2px 7px; }
  .star.on { color:var(--gold); border-color:var(--gold); }
  table { width:100%; border-collapse:collapse; }
  td, th { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); font-size:14px; }
  th { color:var(--dim); font-weight:normal; }
  .err { color:var(--red); }
  .hint { color:var(--dim); font-size:13px; }
</style>
</head>
<body>
<header>
  <h1>Skrzynka autora</h1>
  <button data-tab="feedback" class="on">Wiadomości</button>
  <button data-tab="contributors">Współtwórcy</button>
  <button data-tab="reports">Raporty F9</button>
  <span style="flex:1"></span>
  <button id="logout">Wyloguj</button>
</header>
<main id="main"></main>
<script>
(() => {
  const KEY = 'top-down.inbox-token';
  const main = document.getElementById('main');
  let tab = 'feedback';
  const token = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const el = (tag, props, ...kids) => { const n = document.createElement(tag); Object.assign(n, props || {}); for (const k of kids) n.append(k); return n; };
  const when = (ms) => new Date(ms).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  const who = (r) => r.player_name || r.name || 'bez imienia · ' + String(r.client_id || '').slice(0, 6);

  async function api(path, init) {
    const res = await fetch(path, { ...(init || {}), headers: { 'X-Reports-Token': token(), 'Content-Type': 'application/json' } });
    if (res.status === 404 && !path.match(/\\/reports\\/\\d+/)) throw new Error('auth');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function login(message) {
    main.replaceChildren();
    const input = el('input', { type: 'password', placeholder: 'Token autora (REPORTS_TOKEN)', style: 'width:100%;margin:8px 0' });
    const go = el('button', { textContent: 'Wejdź' });
    const submit = () => { try { localStorage.setItem(KEY, input.value.trim()); } catch {} render(); };
    go.onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    main.append(el('div', { className: 'card' },
      el('div', { textContent: 'Wpisz token autora. Zostanie zapamiętany w tej przeglądarce.' }),
      input, go,
      message ? el('div', { className: 'err', textContent: message }) : ''));
    input.focus();
  }

  function stars(r) {
    const row = el('span', { className: 'row' });
    for (let n = 0; n <= 3; n++) {
      const b = el('button', { className: 'star' + (n > 0 && r.stars >= n ? ' on' : ''), textContent: n === 0 ? '✕' : '★', title: n === 0 ? 'Bez gwiazdek' : n + ' ★' });
      b.onclick = async () => { await api('/reports/' + r.id, { method: 'PATCH', body: JSON.stringify({ stars: n }) }); r.stars = n; row.replaceWith(stars(r)); };
      row.append(b);
    }
    return row;
  }

  function card(r, withStars) {
    const del = el('button', { textContent: 'Usuń' });
    const c = el('div', { className: 'card' },
      el('div', { className: 'meta' },
        el('span', { className: 'who', textContent: who(r) }),
        el('span', { textContent: when(r.created_at) }),
        el('span', { textContent: [r.floor ? 'piętro ' + r.floor : '', r.hero || '', r.build || '', '#' + r.id].filter(Boolean).join(' · ') })),
      el('div', { className: 'text', textContent: r.preview || '' }),
      el('div', { className: 'row' }, withStars ? stars(r) : '', el('span', { style: 'flex:1' }), del));
    del.onclick = async () => { if (!confirm('Usunąć #' + r.id + '?')) return; await api('/reports/' + r.id, { method: 'DELETE' }); c.remove(); };
    return c;
  }

  async function render() {
    if (!token()) return login();
    main.replaceChildren(el('div', { className: 'hint', textContent: 'Wczytuję…' }));
    try {
      if (tab === 'contributors') {
        const rows = await api('/contributors');
        const table = el('table', {}, el('tr', {}, ...['#', 'Tester', '★', 'Wiadomości', 'Raporty', 'Ostatnio'].map((t) => el('th', { textContent: t }))));
        rows.forEach((r, i) => table.append(el('tr', {}, ...[String(i + 1), who(r), String(r.stars), String(r.feedback_count), String(r.report_count), when(r.last_at)].map((t) => el('td', { textContent: t })))));
        main.replaceChildren(
          el('p', { className: 'hint', textContent: 'Ukryta tablica: ranking po gwiazdkach, które przyznajesz w zakładce Wiadomości. Liczba wiadomości i raportów jest tylko informacyjna.' }),
          rows.length ? table : el('p', { textContent: 'Na razie pusto.' }));
        return;
      }
      const query = tab === 'feedback' ? '?kind=feedback&limit=100' : '?limit=100';
      const rows = (await api('/reports' + query)).filter((r) => tab === 'feedback' || r.kind !== 'feedback');
      main.replaceChildren(...(rows.length ? rows.map((r) => card(r, tab === 'feedback')) : [el('p', { textContent: 'Na razie pusto.' })]));
    } catch (e) {
      if (e.message === 'auth') { try { localStorage.removeItem(KEY); } catch {} return login('Zły token.'); }
      main.replaceChildren(el('p', { className: 'err', textContent: 'Błąd: ' + e.message }));
    }
  }

  for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => {
    tab = b.dataset.tab;
    for (const o of document.querySelectorAll('[data-tab]')) o.classList.toggle('on', o === b);
    render();
  };
  document.getElementById('logout').onclick = () => { try { localStorage.removeItem(KEY); } catch {} render(); };
  render();
})();
</script>
</body>
</html>
`;
