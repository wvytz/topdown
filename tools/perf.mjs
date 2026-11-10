/**
 * Profil wydajności przy pełnej nawale (krok U0): PC solo, co-op i telefon (emulacja Pixel 7, procesor ×4 wolniejszy).
 * Skrypt budzi nawałę we wszystkich zwykłych pokojach piętra (sufit 22 żywych wrogów), bohater walczy w miejscu
 * (bez obrażeń), a licznik `?perf=1` (`diagnostics/PerfMeter.ts`) mierzy odstępy klatek i pracę gry w klatce.
 * Do porównania ten sam pomiar w pustym pokoju startowym („spokój”).
 *
 * Użycie:   npm run perf -- [--floor 7] [--seconds 10] [--only pc-horde,phone-horde] [--cpu 4] [--out .perf] [--query gfx=low]
 * Wynik: tabela w konsoli i `<out>/perf-<data>.json`. Przeglądarka jak w smoke (SMOKE_CHROMIUM).
 * Uwaga: przeglądarka bez GPU (kontener, CI) rysuje programowo — liczby są do porównań przed/po, nie absolutne.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { G, aliveEnemies, argOf, devices, godMode, installFakePad, launch, normalRooms, sleep, startServer, teleport, waitForGame } from './lib/gameHarness.mjs';

const args = process.argv.slice(2);
const FLOOR = Number(argOf(args, 'floor', 7));
const SECONDS = Number(argOf(args, 'seconds', 10));
const CPU = Number(argOf(args, 'cpu', 4));
const OUT = resolve(argOf(args, 'out', '.perf'));
const ONLY = argOf(args, 'only', null)?.split(',') ?? null;
const PORT = Number(argOf(args, 'port', 5197));
/** Krok U1: dopisek do adresu, np. `--query gfx=low` — pomiar konkretnego poziomu jakości. */
const EXTRA_QUERY = argOf(args, 'query', null);

const SCENARIOS = [
  { id: 'pc-calm', title: 'PC, spokój', hero: 'barbarian', horde: false },
  { id: 'pc-horde', title: 'PC, pełna nawała', hero: 'barbarian', horde: true },
  { id: 'coop-horde', title: 'Co-op, pełna nawała', hero: 'barbarian', coop: 'archer', horde: true },
  { id: 'phone-calm', title: `Telefon (CPU ×${CPU}), spokój`, hero: 'archer', phone: true, horde: false },
  { id: 'phone-horde', title: `Telefon (CPU ×${CPU}), pełna nawała`, hero: 'archer', phone: true, horde: true },
];

/** Bohater walczy w miejscu: drobny ruch, atak, czasem dash (PC i pad P2); na telefonie dotyk do celowania. */
async function fight(page, scenario, ms) {
  const t0 = Date.now();
  let maxAlive = 0;
  const keys = ['w', 'a', 's', 'd'];
  while (Date.now() - t0 < ms) {
    await godMode(page);
    maxAlive = Math.max(maxAlive, await aliveEnemies(page));
    if (scenario.phone) {
      await sleep(250);
      continue;
    }
    if (scenario.coop) {
      await page.evaluate(() => {
        window.__smokePad.axes = [0, 0, Math.random() * 2 - 1, Math.random() * 2 - 1];
        window.__smokePad.buttons[7] = 1;
      });
    }
    const key = keys[Math.floor(Math.random() * 4)];
    await page.keyboard.down(key);
    await page.mouse.move(200 + Math.random() * 560, 100 + Math.random() * 340);
    await page.mouse.down();
    await sleep(180);
    await page.mouse.up();
    await page.keyboard.up(key);
  }
  return maxAlive;
}

async function measure(browser, base, scenario) {
  const context = scenario.phone
    ? await browser.newContext({ ...devices['Pixel 7 landscape'] })
    : await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  if (scenario.coop) await installFakePad(page);
  if (scenario.phone && CPU > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  }
  const query = `hero=${scenario.hero}&seed=7&floor=${FLOOR}&items=auto&perf=1${scenario.coop ? `&coop=${scenario.coop}` : ''}${EXTRA_QUERY ? `&${EXTRA_QUERY}` : ''}`;
  await page.goto(`${base}${scenario.phone ? 'mobile.html' : ''}?${query}`);
  await waitForGame(page, 60000);
  await sleep(1500);
  await godMode(page);
  if (scenario.horde) {
    // Budzimy nawałę w każdym zwykłym pokoju po kolei; tłum idzie za bohaterem aż do sufitu żywych wrogów.
    const rooms = (await normalRooms(page)).filter((r) => r.kind === 'normal');
    for (const room of rooms) {
      await teleport(page, room.x, room.y);
      await godMode(page);
      await sleep(scenario.phone ? 2500 : 1200);
    }
    await fight(page, scenario, scenario.phone ? 12000 : 8000);
  }
  await page.evaluate(() => window.__perfReset());
  const maxAlive = scenario.horde ? await fight(page, scenario, SECONDS * 1000) : (await sleep(SECONDS * 1000), await aliveEnemies(page));
  const result = await page.evaluate(() => window.__perf());
  const gameTime = await page.evaluate(`(() => { const g = ${G}; return g ? Math.round(g.time.now) : null; })()`);
  await context.close();
  return { ...scenario, ...result, maxAlive, gameTime, errors };
}

const pct = (v) => `${Math.round(v * 100)}%`;
mkdirSync(OUT, { recursive: true });
const { child, url } = await startServer(PORT);
let browser;
const results = [];
try {
  browser = await launch();
  for (const scenario of SCENARIOS.filter((s) => !ONLY || ONLY.includes(s.id))) {
    process.stdout.write(`  ${scenario.title}…\n`);
    results.push(await measure(browser, url, scenario));
  }
} finally {
  await browser?.close().catch(() => {});
  child.kill();
}

console.log(`\nPiętro ${FLOOR}, okno ${SECONDS} s`);
console.log('scenariusz                         | FPS  | klatka p50/p95/p99/maks ms | praca p50/p95 ms | <60 FPS | <30 FPS | wrogów (maks) | obiektów');
for (const r of results) {
  console.log(
    `${r.title.padEnd(34)} | ${String(r.fps).padStart(4)} | ${`${r.intervalP50}/${r.intervalP95}/${r.intervalP99}/${r.intervalMax}`.padStart(26)} | ${`${r.workP50}/${r.workP95}`.padStart(16)} | ${pct(r.slowShare).padStart(7)} | ${pct(r.jankShare).padStart(7)} | ${`${r.enemies} (${r.maxAlive})`.padStart(13)} | ${r.objects}${r.errors.length ? `  BŁĘDY: ${r.errors.join(' | ')}` : ''}`,
  );
}
const file = join(OUT, `perf-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`);
writeFileSync(file, JSON.stringify({ floor: FLOOR, seconds: SECONDS, cpu: CPU, results }, null, 2));
console.log(`\nZapisano: ${file}`);
if (results.some((r) => r.errors.length)) process.exitCode = 1;
