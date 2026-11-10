/**
 * Wspólne narzędzia skryptów przeglądarkowych (krok U0: `shots.mjs`, `perf.mjs`): serwer dev Vite,
 * przeglądarka (Chrome albo `SMOKE_CHROMIUM`), czekanie na scenę gry i sterowanie nią przez `window.__game`.
 * Smoke (`smoke.mjs`) ma własną, starszą kopię tych funkcji.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const root = process.cwd();
const require = createRequire(join(root, 'package.json'));
export const { chromium, devices } = require('playwright-core');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wyrażenie JS (dla `page.evaluate`) zwracające scenę gry z lochem i graczem. */
export const G = `window.__game.scene.getScenes(true).find((x) => x.dungeon && x.player)`;

export function argOf(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

/** Serwer dev Vite na wskazanym porcie; zwraca proces i adres. */
export async function startServer(port) {
  const url = `http://127.0.0.1:${port}/`;
  const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) throw new Error('Brak node_modules — uruchom najpierw `npm install`.');
  const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  });
  let log = '';
  const collect = (chunk) => (log = (log + chunk).slice(-4000));
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) break;
    try {
      if ((await fetch(url)).ok) return { child, url };
    } catch {
      // serwer jeszcze nie wstał
    }
    await sleep(500);
  }
  child.kill();
  throw new Error(`Serwer dev nie wystartował. Wyjście Vite:\n${log.trim() || '(puste)'}`);
}

export async function launch() {
  const executablePath = process.env.SMOKE_CHROMIUM;
  try {
    return await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : { channel: 'chrome' });
  } catch (error) {
    throw new Error(`Nie udało się uruchomić przeglądarki (${String(error).split('\n')[0]}). Zainstaluj Chrome albo ustaw SMOKE_CHROMIUM.`);
  }
}

/** Podstawiony pad (co-op): skrypt ustawia gałki i przyciski w `window.__smokePad`. */
export async function installFakePad(page) {
  await page.addInitScript(() => {
    window.__smokePad = { axes: [0, 0, 0, 0], buttons: Array(17).fill(0) };
    navigator.getGamepads = () => [
      { index: 0, connected: true, axes: window.__smokePad.axes, buttons: window.__smokePad.buttons.map((v) => ({ value: v, pressed: v > 0.5 })) },
    ];
  });
}

/** Czeka, aż wystartuje scena gry (z lochem i graczem). */
export async function waitForGame(page, timeout = 30000) {
  await page.waitForFunction(() => window.__game?.scene?.getScenes(true).some((s) => s.player && s.dungeon), null, { timeout });
}

/** Bohaterowie nie tracą HP (pomiar i kadry nie mogą skończyć się śmiercią). */
export const godMode = (page) =>
  page.evaluate(`(() => { const g = ${G}; if (!g) return; for (const p of g.party.members) p.health.takeDamage = () => ({ dealt: 0, died: false }); })()`);

/** Środki zwykłych pokojów piętra (bez startu, areny i pokojów specjalnych), w kolejności z generatora. */
export const normalRooms = (page) =>
  page.evaluate(`(() => { const g = ${G}; return g.dungeon.rooms.map((r, i) => ({ i, x: r.x + (r.width >> 1), y: r.y + (r.height >> 1), kind: r.kind })); })()`);

/** Przenosi drużynę na środek kafla (x, y). */
export const teleport = (page, x, y) =>
  page.evaluate(`(() => { const g = ${G}; g.party.members.forEach((p, i) => { p.setPosition(${x} * 32 + 16 + i * 20, ${y} * 32 + 16); p.body.updateFromGameObject(); }); })()`);

/** Liczba żywych wrogów na piętrze. */
export const aliveEnemies = (page) => page.evaluate(`(() => { const g = ${G}; return g ? g.enemies.aliveCount : -1; })()`);
