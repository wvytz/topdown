/**
 * Pomiar trudności systemu wag botem (krok U11b, docs/WAGI.md §11): ten sam run z `?wagi=0` i `?wagi=1`.
 * Bot-partner (`?bot=<bohater>`) walczy w każdym zwykłym pokoju pięter; gracz P1 stoi obok nietykalny (wabik
 * dla obu wersji tak samo). Mierzymy obrażenia przyjęte przez bota, „śmierci” (HP poniżej 1 — dolewamy do pełna
 * i liczymy), czas oczyszczenia pokoju (czas gry), ataki kary, najwyższą Passę i uniki bota.
 *
 * Użycie:   npm run bench:wagi -- [--heroes all|barbarian|sorceress|archer] [--floors 1,2,3] [--seeds 1] [--room-seconds 25]
 * Przeglądarka: SMOKE_CHROMIUM=<ścieżka> albo zainstalowany Chrome. Wymaga trybu dev (`window.__game`).
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
const HEROES = opt('heroes', 'all') === 'all' ? ['barbarian', 'sorceress', 'archer'] : [opt('heroes', 'barbarian')];
const FLOORS = opt('floors', '1,2,3').split(',').map(Number);
const SEEDS = Number(opt('seeds', 1));
const ROOM_MS = Number(opt('room-seconds', 25)) * 1000;
const PORT = Number(opt('port', 5198));
const URL = `http://127.0.0.1:${PORT}/`;

const root = process.cwd();
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('playwright-core');
const G = `window.__game.scene.getScenes(true).find((x) => x.dungeon && x.player)`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer() {
  const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) throw new Error('Brak node_modules — uruchom najpierw `npm install`.');
  const child = spawn(process.execPath, [vite, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore', env: { ...process.env, BROWSER: 'none' } });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(URL)).ok) return child;
    } catch {
      // serwer jeszcze nie wstał
    }
    await sleep(500);
  }
  child.kill();
  throw new Error('Serwer dev nie wystartował.');
}

/** Wpina liczniki w scenę: obrażenia i „śmierci” bota, nietykalny P1, ataki kary i Passa (co klatkę gry). */
const INSTRUMENT = `(() => {
  const g = ${G};
  const [lead, bot] = g.party.members;
  lead.takeHit = () => false;
  lead.health.takeDamage = () => ({ dealt: 0, died: false });
  const s = (window.__bench = { taken: 0, deaths: 0, punishes: 0, maxTier: 0, dodges: 0, staggers: 0 });
  const take = bot.health.takeDamage.bind(bot.health);
  bot.health.takeDamage = (amount) => {
    const result = take(Math.min(amount, Math.max(0, bot.health.value - 1)));
    s.taken += amount;
    if (amount >= bot.health.value) { s.deaths++; bot.health.heal(bot.health.max); }
    return result;
  };
  let acting = false;
  let dodging = false;
  g.events.on('postupdate', () => {
    const act = Boolean(g.punish && g.punish.act);
    if (act && !acting) s.punishes++;
    acting = act;
    s.maxTier = Math.max(s.maxTier, bot.weights.tier);
    const dodge = g.partnerInput?.lastDecision?.mode === 'dodge';
    if (dodge && !dodging) s.dodges++;
    dodging = dodge;
  });
  // Przerwane zamachy: łatka na prototyp wroga przy pierwszym wrogu (nawała rodzi się później).
  let patched = false;
  g.events.on('postupdate', () => {
    const e = g.enemies.living[0];
    if (patched || !e) return;
    patched = true;
    const proto = Object.getPrototypeOf(e);
    const stagger = proto.stagger;
    proto.stagger = function (now, ms) { const ok = stagger.call(this, now, ms); if (ok) s.staggers++; return ok; };
  });
})()`;

async function runFloor(browser, hero, floor, seed, wagi) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`${URL}?hero=barbarian&seed=${seed}&floor=${floor}&bot=${hero}&wagi=${wagi}`);
  await page.waitForFunction(() => window.__game?.scene?.getScenes(true).some((s) => s.player && s.dungeon && s.party?.members.length === 2), null, { timeout: 30000 });
  await page.evaluate(INSTRUMENT);
  const rooms = await page.evaluate(`(() => { const g = ${G}; return g.dungeon.rooms.filter((r) => r.kind === 'normal').map((r) => [r.x, r.y, r.width, r.height]); })()`);
  const clears = [];
  rooms: for (const [x, y, w, h] of rooms) {
    await page.evaluate(`(() => { const g = ${G}; if (!g) return; g.party.members.forEach((p, i) => { p.setPosition((${x} + (${w} >> 1)) * 32 + 16 + i * 24, (${y} + (${h} >> 1)) * 32 + 16); p.body.updateFromGameObject(); }); })()`);
    const inRoom = `(e) => e.x >= ${x} * 32 - 16 && e.x <= (${x} + ${w}) * 32 + 16 && e.y >= ${y} * 32 - 16 && e.y <= (${y} + ${h}) * 32 + 16`;
    const start = await page.evaluate(`${G}?.time.now ?? null`);
    if (start === null) break rooms;
    let cleared = null;
    let sawEnemies = false;
    for (;;) {
      await sleep(400);
      const st = await page.evaluate(`(() => { const g = ${G}; if (!g) return null; const left = g.enemies.living.filter(${inRoom}).length; return { now: g.time.now, left }; })()`);
      if (!st) {
        process.stdout.write('  (scena piętra zniknęła — koniec piętra)\n');
        break rooms;
      }
      if (st.left > 0) sawEnemies = true;
      if (sawEnemies && st.left === 0) {
        cleared = st.now - start;
        break;
      }
      if (!sawEnemies && st.now - start > 3000) break; // pusty pokój (kapliczka, skarb)
      if (st.now - start > ROOM_MS) {
        cleared = ROOM_MS;
        break;
      }
    }
    if (cleared !== null) clears.push(cleared);
  }
  const stats = await page.evaluate(`(() => { const g = ${G}; return { ...window.__bench, maxHp: g ? g.party.members[1].health.max : 0 }; })()`);
  await page.close();
  return { ...stats, clears };
}

const server = await startServer();
const executablePath = process.env.SMOKE_CHROMIUM;
const browser = await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : { channel: 'chrome' });
const rows = [];
try {
  for (const hero of HEROES) {
    for (const wagi of [0, 1]) {
      const sum = { taken: 0, deaths: 0, punishes: 0, maxTier: 0, dodges: 0, staggers: 0, clears: [], maxHp: 0 };
      for (const floor of FLOORS) {
        for (let seed = 1; seed <= SEEDS; seed++) {
          const r = await runFloor(browser, hero, floor, seed, wagi);
          for (const k of ['taken', 'deaths', 'punishes', 'dodges', 'staggers']) sum[k] += r[k];
          sum.maxTier = Math.max(sum.maxTier, r.maxTier);
          sum.maxHp = r.maxHp;
          sum.clears.push(...r.clears);
          process.stdout.write(`  ${hero} wagi=${wagi} piętro ${floor} seed ${seed}: −${r.taken} HP, padł ${r.deaths}×, kara ${r.punishes}, uniki ${r.dodges}, przerwane ${r.staggers}, Passa max ${r.maxTier}, pokoje ${r.clears.map((c) => (c / 1000).toFixed(1)).join('/')} s\n`);
        }
      }
      const clearSec = sum.clears.reduce((a, b) => a + b, 0) / 1000;
      rows.push({ hero, wagi, rooms: sum.clears.length, hpPerRoom: (sum.taken / Math.max(1, sum.clears.length)).toFixed(1), deaths: sum.deaths, avgClear: (clearSec / Math.max(1, sum.clears.length)).toFixed(1), punishes: sum.punishes, dodges: sum.dodges, staggers: sum.staggers, maxTier: sum.maxTier, maxHp: sum.maxHp });
    }
  }
} finally {
  await browser.close();
  server.kill();
}
console.log('\nbohater | wagi | pokoje | HP bota/pokój | padł | śr. czas pokoju (s) | kary | uniki | przerwane | Passa max');
for (const r of rows) console.log(`${r.hero} | ${r.wagi} | ${r.rooms} | ${r.hpPerRoom} (z ${r.maxHp}) | ${r.deaths} | ${r.avgClear} | ${r.punishes} | ${r.dodges} | ${r.staggers} | ${r.maxTier}`);
