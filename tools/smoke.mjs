/**
 * Test dymny (smoke) gry w prawdziwej przeglądarce (krok 56): sam uruchamia serwer dev, a bot przechodzi piętra
 * wszystkimi bohaterami (losowe wejścia, wszystkie pokoje, walka w arenie, pokonanie bossa, nagroda, schody) i szuka błędów:
 * wyjątków strony, błędów konsoli i zdarzeń `error` z dziennika diagnostycznego gry.
 *
 * Użycie:   npm run smoke -- [--floors 8] [--seeds 2] [--heroes all|barbarian|sorceress|archer] [--room-seconds 1.5] [--sweep-only] [--coop]
 *           --coop: co-op (krok 109) — drugi bohater (następny z listy) na podstawionym padzie, bot gra oboma i sprawdza wskrzeszanie.
 * Przeglądarka: domyślnie zainstalowany Chrome (kanał „chrome”); inna: SMOKE_CHROMIUM=<ścieżka do pliku wykonywalnego>.
 * Wymaga trybu dev (korzysta z `window.__game`). Kod wyjścia 1, gdy coś się wywróci.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const FLOORS = Number(opt('floors', 8));
const SEEDS = Number(opt('seeds', 2));
const HEROES = ['all', 'both'].includes(opt('heroes', 'all')) ? ['barbarian', 'sorceress', 'archer'] : [opt('heroes', 'barbarian')];
const ROOM_MS = Number(opt('room-seconds', 1.5)) * 1000;
const SWEEP_ONLY = args.includes('--sweep-only');
const COOP = args.includes('--coop');
const ALL_HEROES = ['barbarian', 'sorceress', 'archer'];
const partnerOf = (hero) => ALL_HEROES[(ALL_HEROES.indexOf(hero) + 1) % ALL_HEROES.length];
const label = (hero) => (COOP ? `${hero}+${partnerOf(hero)}` : hero);
const PORT = Number(opt('port', 5199));
const URL = `http://127.0.0.1:${PORT}/`;

const root = process.cwd();
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('playwright-core');

const G = `window.__game.scene.getScenes(true).find((x) => x.dungeon && x.player)`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (n) => Math.floor(Math.random() * n);

async function startServer() {
  const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) throw new Error('Brak node_modules — uruchom najpierw `npm install`.');
  const child = spawn(process.execPath, [vite, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  });
  // Wyjście Vite zbieramy po cichu — pokazujemy je tylko, gdy serwer nie wstanie (np. brak esbuild, zajęty port).
  let log = '';
  const collect = (chunk) => (log = (log + chunk).slice(-4000));
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) break;
    try {
      if ((await fetch(URL)).ok) return child;
    } catch {
      // serwer jeszcze nie wstał
    }
    await sleep(500);
  }
  child.kill();
  throw new Error(`Serwer dev nie wystartował. Wyjście Vite:\n${log.trim() || '(puste)'}`);
}

async function launch() {
  const executablePath = process.env.SMOKE_CHROMIUM;
  try {
    return await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : { channel: 'chrome' });
  } catch (error) {
    throw new Error(`Nie udało się uruchomić przeglądarki (${String(error).split('\n')[0]}). Zainstaluj Chrome albo ustaw SMOKE_CHROMIUM.`);
  }
}

/** Błędy z dziennika diagnostycznego gry (zdarzenia poziomu error z ostatniej sesji). */
const diagErrors = (page) =>
  page.evaluate(() => {
    try {
      const sessions = JSON.parse(localStorage.getItem('tower-crawler.diagnostics.v1') ?? '[]');
      const last = sessions[sessions.length - 1];
      return (last?.events ?? []).filter((e) => e.level === 'error').map((e) => `${e.kind}: ${e.message}`);
    } catch {
      return [];
    }
  });

async function newSession(browser, hero) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/404/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on('crash', () => errors.push('KARTA PRZEGLĄDARKI SIĘ WYWRÓCIŁA'));
  if (COOP) {
    // Podstawiony pad P2: bot ustawia gałki i przyciski w `window.__smokePad`.
    await page.addInitScript(() => {
      window.__smokePad = { axes: [0, 0, 0, 0], buttons: Array(17).fill(0) };
      navigator.getGamepads = () => [
        { index: 0, connected: true, axes: window.__smokePad.axes, buttons: window.__smokePad.buttons.map((v) => ({ value: v, pressed: v > 0.5 })) },
      ];
    });
  }
  await page.goto(`${URL}?hero=${hero}&seed=1&floor=1${COOP ? `&coop=${partnerOf(hero)}` : ''}`);
  await page.waitForFunction(() => window.__game?.scene?.getScenes(true).some((s) => s.player && s.dungeon), null, { timeout: 30000 });
  return { page, errors };
}

const gameFloor = (page) => page.evaluate(`(() => { const g = ${G}; return g ? g.floorNumber : null; })()`);

/** Faza 1: szybkie wejście na każde piętro × seed (generowanie, dekorowanie, tworzenie wszystkiego). */
async function sweep(browser, hero, report) {
  const { page, errors } = await newSession(browser, hero);
  for (let floor = 1; floor <= FLOORS; floor++) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const before = errors.length;
      await page.evaluate(([f, s]) => {
        const g = window.__game.scene.getScenes(true).find((x) => x.dungeon && x.player);
        g.scene.restart({ runSeed: s * 7919 + f, floor: f, run: g.run.snapshot(null), ...(g.coop ? { coop: g.coop } : {}) });
      }, [floor, seed]);
      try {
        await page.waitForFunction(([f]) => window.__game.scene.getScenes(true).some((x) => x.player && x.dungeon && x.floorNumber === f), [floor], { timeout: 10000 });
      } catch {
        errors.push(`scena piętra ${floor} (seed ${seed}) nie wystartowała`);
      }
      await sleep(200);
      if (errors.length > before) report.push({ hero, phase: 'sweep', floor, seed, errors: errors.slice(before) });
    }
  }
  const fromDiag = await diagErrors(page);
  if (fromDiag.length) report.push({ hero, phase: 'sweep (dziennik gry)', errors: fromDiag });
  await page.close();
}

async function fightFor(page, ms, errors) {
  const keys = ['w', 'a', 's', 'd'];
  const t0 = Date.now();
  while (Date.now() - t0 < ms && errors.length === 0) {
    await page.evaluate(`(() => { const g = ${G}; if (!g) return; for (const p of g.party.members) if (!p.isDead) p.health.takeDamage = () => ({ dealt: 0, died: false }); })()`).catch(() => {});
    if (COOP) {
      // P2: losowy ruch, celowanie i przyciski pada (RT — atak, LT — drugi atak, A — dash).
      await page
        .evaluate(([mx, my, ax, ay, rt, lt, a]) => {
          window.__smokePad.axes = [mx, my, ax, ay];
          const b = window.__smokePad.buttons;
          b[7] = rt;
          b[6] = lt;
          b[0] = a;
        }, [rnd(3) - 1, rnd(3) - 1, rnd(3) - 1, rnd(3) - 1, Math.random() < 0.7 ? 1 : 0, Math.random() < 0.3 ? 1 : 0, Math.random() < 0.2 ? 1 : 0])
        .catch(() => {});
    }
    const key = keys[rnd(4)];
    await page.keyboard.down(key);
    if (Math.random() < 0.4) await page.keyboard.press('Space');
    await page.mouse.move(100 + rnd(760), 60 + rnd(420));
    const button = Math.random() < 0.7 ? 'left' : 'right';
    await page.mouse.down({ button });
    await sleep(120 + rnd(250));
    await page.mouse.up({ button }).catch(() => {});
    await page.keyboard.up(key);
  }
}

/** Co-op: powalony P2 wstaje, gdy P1 stoi przy nim (krok 105). */
async function checkRevive(page, floor, errors) {
  const down = await page.evaluate(`(() => { const g = ${G}; const [a, b] = g.party.members; if (!b) return false;
    delete b.health.takeDamage; b.takeHit({ damage: 99999, knockback: { x: 0, y: 0 } }, g.time.now + 1e7);
    a.setPosition(b.x + 12, b.y); a.body.updateFromGameObject(); return b.isDead && !g.party.isDown; })()`);
  if (!down) {
    errors.push(`co-op: piętro ${floor} — powalenie P2 nie zadziałało`);
    return;
  }
  // Czekamy na czas gry, nie na zegar ściany: wolna przeglądarka (bez GPU) daje mniej klatek.
  const state = () =>
    page.evaluate(`(() => { const g = ${G}; const [a, b] = g.party.members; const r = g.revives.get(b);
      return { up: !b.isDead, now: g.time.now, progress: r ? r.progress : null, dist: Math.round(Math.hypot(a.x - b.x, a.y - b.y)) }; })()`);
  const start = await state();
  let last = start;
  for (let i = 0; i < 40 && !last.up && last.now - start.now < 6000; i++) {
    await sleep(250);
    last = await state();
  }
  if (!last.up) errors.push(`co-op: piętro ${floor} — P2 nie wstał po wskrzeszaniu (${Math.round(last.now - start.now)} ms gry, postęp ${last.progress}, odstęp ${last.dist} px)`);
}

/** Faza 2: pełna wspinaczka z botem — wszystkie pokoje, arena, boss, nagroda, schody klawiszem E. */
async function climb(browser, hero, report) {
  const { page, errors } = await newSession(browser, hero);
  for (let floor = 1; floor <= FLOORS && errors.length === 0; floor++) {
    if (COOP) await checkRevive(page, floor, errors);
    const info = await page.evaluate(`(() => { const g = ${G}; return { floor: g.floorNumber, rooms: g.dungeon.rooms.map((r) => [r.x + (r.width >> 1), r.y + (r.height >> 1), r.kind]) }; })()`);
    for (const [x, y, kind] of info.rooms) {
      if (kind === 'boss') continue;
      await page.evaluate(`(() => { const g = ${G}; g.run.addGold(50); g.party.members.forEach((p, i) => { p.setPosition(${x} * 32 + 16 + i * 20, ${y} * 32 + 16); p.body.updateFromGameObject(); }); })()`);
      await fightFor(page, ROOM_MS, errors);
      if (errors.length) break;
    }
    if (errors.length) break;
    const arena = await page.evaluate(`(() => { const g = ${G}; const r = g.dungeon.rooms[g.dungeon.bossRoomId]; return [r.x + (r.width >> 1), r.y + (r.height >> 1)]; })()`);
    await page.evaluate(`(() => { const g = ${G}; g.party.members.forEach((p, i) => { p.setPosition(${arena[0]} * 32 + 16 + i * 20, ${arena[1]} * 32 + 16); p.body.updateFromGameObject(); }); })()`);
    await fightFor(page, ROOM_MS * 2, errors);
    await page.evaluate(`(() => { const g = ${G}; if (g && g.bossFight) g.bossFight.debugDefeat(); })()`).catch(() => {});
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      const reward = await page.evaluate(() => window.__game.scene.getScenes(true).some((s) => s.scene.key === 'RewardScene'));
      if (reward) {
        // Co-op: dwie karty po kolei — wybieramy, dopóki nakładka wraca.
        let gone = 0;
        for (let k = 0; k < 16 && gone < 2; k++) {
          await sleep(600);
          await page.keyboard.press('1');
          const still = await page.evaluate(() => window.__game.scene.getScenes(true).some((s) => s.scene.key === 'RewardScene'));
          gone = still ? 0 : gone + 1;
        }
        break;
      }
    }
    await sleep(400);
    await page.evaluate(`(() => { const g = ${G}; const st = g.dungeon.stairs; g.party.members.forEach((p, i) => { p.setPosition(st.x * 32 + 32 + i * 12, st.y * 32 + 32); p.body.updateFromGameObject(); }); })()`);
    await sleep(300);
    // E trzymane przez kilka klatek — pojedyncze stuknięcie potrafi zniknąć między klatkami.
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.keyboard.down('e');
      await sleep(120);
      await page.keyboard.up('e');
      await sleep(1500);
      if ((await gameFloor(page)) === floor + 1) break;
    }
    const now = await gameFloor(page);
    process.stdout.write(`  ${label(hero)}: piętro ${floor} → ${now}\n`);
    if (now !== floor + 1 && floor < FLOORS) errors.push(`nie udało się wejść z piętra ${floor} na kolejne (stoi na ${now})`);
    if (now !== floor + 1) break;
  }
  const fromDiag = await diagErrors(page);
  if (errors.length) report.push({ hero, phase: 'wspinaczka', errors: errors.slice(0, 5) });
  if (fromDiag.length) report.push({ hero, phase: 'wspinaczka (dziennik gry)', errors: fromDiag.slice(0, 5) });
  await page.close();
}

const server = await startServer();
let browser;
const report = [];
try {
  browser = await launch();
  for (const hero of HEROES) {
    process.stdout.write(`Smoke: ${label(hero)}, piętra 1–${FLOORS}, ${SEEDS} seed(y)\n`);
    await sweep(browser, hero, report);
    if (!SWEEP_ONLY) await climb(browser, hero, report);
  }
} finally {
  await browser?.close().catch(() => {});
  server.kill();
}

if (report.length === 0) {
  console.log('SMOKE OK — bez błędów.');
} else {
  console.log('SMOKE: ZNALEZIONO BŁĘDY');
  for (const item of report) console.log(`- ${item.hero} / ${item.phase}${item.floor ? ` / piętro ${item.floor} seed ${item.seed}` : ''}:\n    ${item.errors.join('\n    ')}`);
  process.exitCode = 1;
}
