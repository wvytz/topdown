/**
 * Pomiar trudności Zaćmień botem (Akt II, krok Z5). Ten sam bot co w `npm run smoke` (losowe ruchy, ciosy, dash)
 * przechodzi Zejście na każdym poziomie Zaćmienia — te same seedy, te same odbicia — i liczy obciążenie:
 * obrażenia, które spadłyby na bohatera (bohater jest nieśmiertelny, liczymy próby), wrogów i elity, pomocników bossa.
 * Wynik to porównanie poziomów względem poziomu 0, nie bezwzględna trudność dla człowieka.
 *
 * Użycie:   node tools/eclipse-measure.mjs [--seeds 1] [--room-seconds 1.2] [--boss-seconds 8] [--levels 0,1,2,3] [--hero barbarian]
 * Przeglądarka jak w smoke: kanał „chrome” albo SMOKE_CHROMIUM=<ścieżka>.
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
const SEEDS = Number(opt('seeds', 1));
const ROOM_MS = Number(opt('room-seconds', 1.2)) * 1000;
// Świta wychodzi pierwszy raz po ok. 9 s walki, potem co kilkanaście — krótsze okno jej nie zobaczy.
const BOSS_MS = Number(opt('boss-seconds', 25)) * 1000;
const LEVELS = opt('levels', '0,1,2,3').split(',').map(Number);
const HERO = opt('hero', 'barbarian');
/** Stała droga przez odbicia (6 głębi) — wszystkie poziomy mierzą te same piętra. */
const PATH = [1, 2, 3, 4, 5, 7];
const PORT = Number(opt('port', 5198));
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

async function launch() {
  const executablePath = process.env.SMOKE_CHROMIUM;
  return chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : { channel: 'chrome' });
}

/** Liczniki w stronie: obrażenia przyjęte przez bohatera, wrogowie i elity widziani na piętrze. */
const INSTRUMENT = `(() => { const g = ${G}; if (!g) return;
  const m = (window.__measure ??= { damage: 0, seen: new Set(), elites: 0, affixes: 0 });
  for (const p of g.party.members) if (!p.__measured) { p.__measured = true; p.health.takeDamage = (amount) => { m.damage += amount; return { dealt: 0, died: false }; }; }
  for (const e of g.enemies.living) if (!m.seen.has(e)) { m.seen.add(e); const n = (e.affixes ?? e.definition?.affixes ?? []).length; if (n > 0) { m.elites += 1; m.affixes += n; } }
})()`;

async function fightFor(page, ms) {
  const keys = ['w', 'a', 's', 'd'];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await page.evaluate(INSTRUMENT).catch(() => {});
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

async function measureFloor(page, seed, level, index) {
  const floor = PATH[index];
  await page.evaluate(
    ([s, f, e, path]) => {
      window.__measure = { damage: 0, seen: new Set(), elites: 0, affixes: 0 };
      const g = window.__game.scene.getScenes(true).find((x) => x.dungeon && x.player);
      g.scene.restart({ runSeed: s, floor: f, run: { hero: g.run.hero, gold: 0, items: [], hp: null, mode: 'descent', descentPath: path, eclipse: e } });
    },
    [seed, floor, level, PATH.slice(0, index + 1)],
  );
  await page.waitForFunction((f) => window.__game.scene.getScenes(true).some((x) => x.player && x.dungeon && x.floorNumber === f), floor, { timeout: 15000 });
  await sleep(300);
  const rooms = await page.evaluate(`(() => { const g = ${G}; return g.dungeon.rooms.filter((r) => r.kind !== 'boss').map((r) => [r.x + (r.width >> 1), r.y + (r.height >> 1)]); })()`);
  for (const [x, y] of rooms) {
    await page.evaluate(`(() => { const g = ${G}; g.player.setPosition(${x} * 32 + 16, ${y} * 32 + 16); g.player.body.updateFromGameObject(); })()`);
    await fightFor(page, ROOM_MS);
  }
  const rooms_ = await page.evaluate('({ damage: window.__measure.damage, enemies: window.__measure.seen.size, elites: window.__measure.elites, affixes: window.__measure.affixes })');
  // Plan nawały piętra (ile fal i stworków czeka w pokojach) — bot rzadko czyści pokój, więc liczymy z planu.
  const horde = await page.evaluate(`(() => { const g = ${G}; const plans = g.horde?.deps?.plans ?? []; return { waves: plans.reduce((n, p) => n + p.waves.length, 0), minions: plans.reduce((n, p) => n + p.waves.reduce((a, b) => a + b, 0), 0) }; })()`);
  const arena = await page.evaluate(`(() => { const g = ${G}; const r = g.dungeon.rooms[g.dungeon.bossRoomId]; return [r.x + (r.width >> 1), r.y + (r.height >> 1)]; })()`);
  await page.evaluate(`(() => { const g = ${G}; g.player.setPosition(${arena[0]} * 32 + 16, ${arena[1]} * 32 + 16); g.player.body.updateFromGameObject(); window.__measure.damage = 0; window.__measure.seen = new Set(); })()`);
  await fightFor(page, BOSS_MS);
  const boss = await page.evaluate('({ damage: window.__measure.damage, enemies: window.__measure.seen.size })');
  return { roomsDamage: rooms_.damage, enemies: rooms_.enemies, elites: rooms_.elites, affixes: rooms_.affixes, hordeWaves: horde.waves, hordeMinions: horde.minions, bossDamage: boss.damage, bossAdds: boss.enemies };
}

const server = await startServer();
const browser = await launch();
const totals = new Map();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`${URL}?hero=${HERO}&seed=1&floor=1&safari=0`);
  await page.waitForFunction(() => window.__game?.scene?.getScenes(true).some((s) => s.player && s.dungeon), null, { timeout: 30000 });
  for (const level of LEVELS) {
    const sum = { roomsDamage: 0, enemies: 0, elites: 0, affixes: 0, hordeWaves: 0, hordeMinions: 0, bossDamage: 0, bossAdds: 0 };
    for (let seed = 1; seed <= SEEDS; seed++) {
      for (let i = 0; i < PATH.length; i++) {
        const row = await measureFloor(page, seed * 7919, level, i);
        for (const key of Object.keys(sum)) sum[key] += row[key];
        process.stdout.write(`  Zaćmienie ${level}, seed ${seed}, głębia ${i + 1}: ${JSON.stringify(row)}\n`);
      }
    }
    totals.set(level, sum);
  }
} finally {
  await browser.close().catch(() => {});
  server.kill();
}

const base = totals.get(LEVELS[0]);
const ratio = (value, ref) => (ref > 0 ? `×${(value / ref).toFixed(2)}` : '—');
console.log('\nPoziom | obrażenia w pokojach | wrogowie | cechy elit | fale nawały (plan) | stworki (plan) | obrażenia przy bossie | wrogowie przy bossie');
for (const [level, sum] of totals) {
  const cell = (key) => `${Math.round(sum[key])} (${ratio(sum[key], base[key])})`;
  console.log(`${level}      | ${cell('roomsDamage')} | ${cell('enemies')} | ${cell('affixes')} | ${cell('hordeWaves')} | ${cell('hordeMinions')} | ${cell('bossDamage')} | ${cell('bossAdds')}`);
}
console.log('Uwaga: obrażenia zależą od losowych ruchów bota — patrz na kierunek przy kilku seedach, nie na pojedyncze liczby.');
