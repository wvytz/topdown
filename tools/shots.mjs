/**
 * Kadry bazowe (krok U0): to samo 12 kadrów przed i po każdym etapie upgradu — 7 biomów (pokój z nawałą),
 * 3 bossów, HUD z przedmiotami i wersja na telefon. Na końcu jeden arkusz 4×3, który właściciel ocenia zamiast grać.
 *
 * Użycie:   npm run shots -- [--label przed] [--out .shots] [--before .shots/przed] [--only boss-4,phone]
 *           --before <katalog>: arkusz porównawczy — każdy kadr obok kadru z tego katalogu (przed | po).
 * Przeglądarka jak w smoke: Chrome albo SMOKE_CHROMIUM=<ścieżka>. Wymaga trybu dev (`window.__game`).
 * Seedy i miejsca są stałe; ruch wrogów i efekty wizualne (`Math.random`) różnią się między przebiegami.
 */
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { G, argOf, devices, godMode, launch, normalRooms, sleep, startServer, teleport, waitForGame } from './lib/gameHarness.mjs';

const args = process.argv.slice(2);
const LABEL = argOf(args, 'label', new Date().toISOString().slice(0, 10));
const OUT = resolve(argOf(args, 'out', '.shots'), LABEL);
const BEFORE = argOf(args, 'before', null);
const ONLY = argOf(args, 'only', null)?.split(',') ?? null;
const PORT = Number(argOf(args, 'port', 5198));
const SEED = 7;

/** Lista kadrów — stała, żeby arkusze z kolejnych etapów dało się położyć obok siebie. */
const FRAMES = [
  { id: 'biome-1', title: '1 Ruiny', hero: 'barbarian', floor: 1 },
  { id: 'biome-2', title: '2 Grzybnia', hero: 'archer', floor: 2 },
  { id: 'biome-3', title: '3 Cmentarzysko', hero: 'sorceress', floor: 3 },
  { id: 'biome-4', title: '4 Piekło', hero: 'barbarian', floor: 4 },
  { id: 'biome-5', title: '5 Zadymiona palarnia', hero: 'archer', floor: 5 },
  { id: 'biome-6', title: '6 Lustrzana komnata', hero: 'sorceress', floor: 6 },
  { id: 'biome-7', title: '7 Bociani Ogród', hero: 'barbarian', floor: 7 },
  { id: 'boss-1', title: 'Boss: Król Szlamu', hero: 'archer', floor: 1, boss: true },
  { id: 'boss-4', title: 'Boss: Palacz', hero: 'sorceress', floor: 4, boss: true },
  { id: 'boss-7', title: 'Boss: Brudna Wiedźma', hero: 'barbarian', floor: 7, boss: true },
  { id: 'hud', title: 'HUD z przedmiotami (piętro 5)', hero: 'sorceress', floor: 5, hud: true },
  { id: 'phone', title: 'Telefon (Grzybnia)', hero: 'archer', floor: 2, phone: true },
];

async function capture(browser, base, frame) {
  const context = frame.phone
    ? await browser.newContext({ ...devices['Pixel 7 landscape'] })
    : await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const query = `hero=${frame.hero}&seed=${SEED}&floor=${frame.floor}${frame.boss ? '&boss=1' : ''}${frame.hud ? '' : '&items=0'}`;
  await page.goto(`${base}${frame.phone ? 'mobile.html' : ''}?${query}`);
  await waitForGame(page);
  await sleep(800);
  await godMode(page);
  if (frame.boss) {
    // Arena: boss budzi się, gdy bohater wejdzie głębiej — krok w stronę środka i chwila na pierwszy atak.
    await page.evaluate(`(() => { const g = ${G}; const r = g.dungeon.rooms[g.dungeon.bossRoomId];
      g.party.members.forEach((p, i) => { p.setPosition((r.x + (r.width >> 1)) * 32 + 16 + i * 20, (r.y + r.height - 3) * 32 + 16); p.body.updateFromGameObject(); }); })()`);
    await sleep(4500);
  } else if (!frame.hud) {
    // Pierwszy zwykły pokój: nawała wychodzi po 0,5 s, kadr po pierwszej fali.
    const room = (await normalRooms(page)).find((r) => r.kind === 'normal');
    if (room) await teleport(page, room.x, room.y);
    await sleep(2600);
  } else {
    await sleep(1200);
  }
  await godMode(page);
  const file = join(OUT, `${frame.id}.png`);
  await page.screenshot({ path: file });
  await context.close();
  return { ...frame, file, errors };
}

/** Arkusz: kadry w siatce z podpisami (HTML w przeglądarce, bez dodatkowych zależności). */
async function sheet(browser, shots) {
  const img = (path) => (existsSync(path) ? `data:image/png;base64,${readFileSync(path).toString('base64')}` : '');
  const cols = BEFORE ? 2 : 4;
  const cells = shots
    .map((s) => {
      const pair = BEFORE ? [img(join(resolve(BEFORE), `${s.id}.png`)), img(s.file)] : [img(s.file)];
      return pair.map((src, k) => `<figure><img src="${src}"><figcaption>${s.title}${BEFORE ? (k ? ' — po' : ' — przed') : ''}</figcaption></figure>`).join('');
    })
    .join('');
  const page = await browser.newPage({ viewport: { width: cols * 480 + (cols + 1) * 8, height: 400 } });
  await page.setContent(`<style>body{margin:0;background:#120d0e;font:14px system-ui;color:#eadfd6}
    main{display:grid;grid-template-columns:repeat(${cols},480px);gap:8px;padding:8px}
    figure{margin:0}img{width:480px;height:270px;object-fit:contain;background:#000;image-rendering:pixelated;display:block}
    figcaption{padding:4px 2px}</style><main>${cells}</main>`);
  const path = join(OUT, BEFORE ? 'porownanie.png' : 'arkusz.png');
  await page.screenshot({ path, fullPage: true });
  await page.close();
  return path;
}

mkdirSync(OUT, { recursive: true });
const { child, url } = await startServer(PORT);
let browser;
const shots = [];
try {
  browser = await launch();
  for (const frame of FRAMES.filter((f) => !ONLY || ONLY.includes(f.id))) {
    const shot = await capture(browser, url, frame);
    process.stdout.write(`  ${frame.id}: ${shot.errors.length ? `BŁĘDY ${shot.errors.join(' | ')}` : 'ok'}\n`);
    shots.push(shot);
  }
  console.log(`Arkusz: ${await sheet(browser, shots)}`);
} finally {
  await browser?.close().catch(() => {});
  child.kill();
}
if (shots.some((s) => s.errors.length)) process.exitCode = 1;
