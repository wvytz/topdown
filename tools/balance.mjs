/**
 * Pomiar siły bohaterów botem (krok U8e, plan U8: „pomiar siły 3 bohaterów botem z raportem”).
 *
 * Bot-partner (`?bot=<bohater>`, krok 149) walczy sam: pierwszy gracz stoi nietykalny i bierny na środku
 * pokoju, bot bije według tych samych zasad co człowiek z padem. Dla każdego bohatera mierzymy:
 *   - arenę bossa każdego piętra (1–7): obrażenia bossa na sekundę, szacowany czas walki solo
 *     (HP bossa bez mnożnika co-opu / obrażenia na sekundę), utracone HP bota i powalenia;
 *   - pierwszy pokój z nawałą (piętra 1, 3, 5): czas do wybicia pokoju i utracone HP.
 * Wynik: tabela w konsoli i `docs/balance/U8e-<data>.md` (z `--out`). Liczby są przybliżone — bot gra gorzej
 * od człowieka, a w co-opie boss ma więcej HP (liczymy surowe obrażenia, nie ułamek paska).
 *
 * Użycie:  node tools/balance.mjs [--heroes barbarian,archer] [--floors 1-7] [--seconds 30] [--out docs/balance]
 * Przeglądarka jak w smoke: Chrome albo SMOKE_CHROMIUM=<ścieżka>. Wymaga trybu dev (`window.__game`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { G, argOf, launch, sleep, startServer, waitForGame } from './lib/gameHarness.mjs';

const args = process.argv.slice(2);
const HEROES = argOf(args, 'heroes', 'barbarian,sorceress,archer').split(',');
const [FROM, TO] = argOf(args, 'floors', '1-7').split('-').map(Number);
const SECONDS = Number(argOf(args, 'seconds', 30));
const OUT = argOf(args, 'out', null);
const PORT = Number(argOf(args, 'port', 5194));
const SEED = Number(argOf(args, 'seed', 7));
const HORDE_FLOORS = [1, 3, 5].filter((f) => f >= FROM && f <= TO);

/** Pierwszy gracz musi być innym bohaterem niż bot (co-op: różni bohaterowie). */
const leaderFor = (hero) => (hero === 'barbarian' ? 'archer' : 'barbarian');

/** Pierwszy gracz: nietykalny, bierny, bez ruchu — walczy tylko bot. */
async function passiveLeader(page) {
  await page.evaluate(`(() => { const g = ${G}; const p = g.player; p.health.takeDamage = () => ({ dealt: 0, died: false }); p.takeHit = () => false; })()`);
}

async function open(browser, hero, floor, boss) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${BASE}?hero=${leaderFor(hero)}&bot=${hero}&seed=${SEED}&floor=${floor}&items=0${boss ? '&boss=1' : ''}`);
  await waitForGame(page);
  await sleep(600);
  await passiveLeader(page);
  return { context, page, errors };
}

const botState = (page) =>
  page.evaluate(`(() => { const g = ${G}; const b = g.party.members[1]; return { hp: b.health.value, max: b.health.max, down: b.isDead }; })()`);

/** Arena: oba bohaterowie w głębi areny, boss się budzi; po `SECONDS` — ile HP stracił boss. */
async function measureBoss(browser, hero, floor) {
  const { context, page, errors } = await open(browser, hero, floor, true);
  await page.evaluate(`(() => { const g = ${G}; const r = g.dungeon.rooms[g.dungeon.bossRoomId];
    g.party.members.forEach((p, i) => { p.setPosition((r.x + (r.width >> 1)) * 32 + 16 + i * 24, (r.y + (r.height >> 1)) * 32 + 16); p.body.updateFromGameObject(); }); })()`);
  const bossHp = `(() => { const g = ${G}; const f = g.bossFight.fights ?? [g.bossFight]; return f.reduce((s, x) => s + (x.hp ?? 0), 0); })()`;
  const bossMax = `(() => { const g = ${G}; const f = g.bossFight.fights ?? [g.bossFight]; return f.reduce((s, x) => s + (x.maxHp ?? 0), 0); })()`;
  const name = await page.evaluate(`(() => { const g = ${G}; return g.bossFight.name ?? '?'; })()`);
  await sleep(1500);
  const startHp = await page.evaluate(bossHp);
  const maxHp = await page.evaluate(bossMax);
  const start = await botState(page);
  let downs = 0;
  let wasDown = false;
  let lost = 0;
  let last = start.hp;
  let elapsed = 0;
  let endHp = startHp;
  for (; elapsed < SECONDS * 1000; elapsed += 500) {
    await sleep(500);
    const s = await botState(page);
    if (s.down && !wasDown) downs++;
    wasDown = s.down;
    lost += Math.max(0, last - s.hp);
    last = s.hp;
    endHp = await page.evaluate(bossHp);
    if (endHp <= 0 || s.down) break;
  }
  const seconds = Math.max(0.5, elapsed / 1000);
  const dealt = Math.max(0, startHp - endHp);
  await context.close();
  return { floor, name, dps: dealt / seconds, maxHp, lost, downs, killed: endHp <= 0, seconds, errors };
}

/** Pierwszy pokój z nawałą: czas do wybicia (albo limit) i utracone HP bota. */
async function measureHorde(browser, hero, floor) {
  const { context, page, errors } = await open(browser, hero, floor, false);
  const room = await page.evaluate(`(() => { const g = ${G}; const plan = g.hordePlans[0]; if (!plan) return null; const r = g.dungeon.rooms[plan.roomId];
    return { id: plan.roomId, x: r.x + 1, y: r.y + 1 }; })()`);
  if (!room) {
    await context.close();
    return { floor, seconds: null, lost: 0, downs: 0, errors };
  }
  // Róg pokoju (jak wejście drzwiami): stworki wychodzą co najmniej 3 kafle od bohaterów.
  await page.evaluate(`(() => { const g = ${G}; g.party.members.forEach((p, i) => { p.setPosition(${room.x} * 32 + 16 + i * 24, ${room.y} * 32 + 16); p.body.updateFromGameObject(); }); })()`);
  const start = await botState(page);
  let lost = 0;
  let last = start.hp;
  let downs = 0;
  let cleared = null;
  for (let t = 0; t < SECONDS * 2000; t += 500) {
    await sleep(500);
    const s = await botState(page);
    lost += Math.max(0, last - s.hp);
    last = s.hp;
    if (s.down) {
      downs++;
      break;
    }
    const phase = await page.evaluate(`(() => { const g = ${G}; return g.horde.roomPhase(${room.id}); })()`);
    if (phase === 'done') {
      cleared = (t + 500) / 1000;
      break;
    }
  }
  await context.close();
  return { floor, seconds: cleared, lost, downs, errors };
}

const fmt = (n, d = 0) => (n === null || n === undefined ? '—' : Number(n).toFixed(d));

const server = await startServer(PORT);
const BASE = server.url ?? `http://127.0.0.1:${PORT}/`;
const browser = await launch();
const results = {};
try {
  for (const hero of HEROES) {
    results[hero] = { bosses: [], hordes: [] };
    for (let floor = FROM; floor <= TO; floor++) {
      const r = await measureBoss(browser, hero, floor);
      results[hero].bosses.push(r);
      process.stdout.write(`${hero} · boss ${floor} (${r.name}): ${fmt(r.dps, 1)} obr./s, HP bota −${fmt(r.lost)}, powalenia ${r.downs}${r.killed ? ', pokonany' : ''}${r.errors.length ? ` · BŁĘDY: ${r.errors.join(' | ')}` : ''}\n`);
    }
    for (const floor of HORDE_FLOORS) {
      const r = await measureHorde(browser, hero, floor);
      results[hero].hordes.push(r);
      process.stdout.write(`${hero} · nawała ${floor}: ${r.seconds === null ? 'nie wybił' : `${fmt(r.seconds, 1)} s`}, HP bota −${fmt(r.lost)}${r.errors.length ? ` · BŁĘDY: ${r.errors.join(' | ')}` : ''}\n`);
    }
  }
} finally {
  await browser.close();
  server.kill?.();
  server.child?.kill?.();
}

const lines = [];
lines.push(`# Pomiar bohaterów botem — ${new Date().toISOString().slice(0, 10)}`, '');
lines.push(`Seed ${SEED}, ${SECONDS} s na arenę, bot-partner (krok 149) walczy sam, pierwszy gracz bierny i nietykalny. Obrażenia surowe (w co-opie boss ma ×1,7 HP).`, '');
lines.push('## Bossowie — obrażenia na sekundę (HP bota stracone / powalenia)', '');
lines.push(`| Piętro | Boss | ${HEROES.join(' | ')} |`);
lines.push(`|---|---|${HEROES.map(() => '---').join('|')}|`);
for (let floor = FROM; floor <= TO; floor++) {
  const cells = HEROES.map((h) => {
    const r = results[h].bosses.find((b) => b.floor === floor);
    return r ? `${fmt(r.dps, 1)} (−${fmt(r.lost)}${r.downs ? `, ${r.downs}× powalony` : ''})` : '—';
  });
  const name = results[HEROES[0]].bosses.find((b) => b.floor === floor)?.name ?? '?';
  lines.push(`| ${floor} | ${name} | ${cells.join(' | ')} |`);
}
lines.push('', '## Nawała — czas wybicia pierwszego pokoju (HP bota stracone)', '');
lines.push(`| Piętro | ${HEROES.join(' | ')} |`);
lines.push(`|---|${HEROES.map(() => '---').join('|')}|`);
for (const floor of HORDE_FLOORS) {
  const cells = HEROES.map((h) => {
    const r = results[h].hordes.find((x) => x.floor === floor);
    return r ? `${r.seconds === null ? 'nie wybił' : `${fmt(r.seconds, 1)} s`} (−${fmt(r.lost)})` : '—';
  });
  lines.push(`| ${floor} | ${cells.join(' | ')} |`);
}
const report = lines.join('\n') + '\n';
process.stdout.write('\n' + report);
if (OUT) {
  const dir = resolve(OUT);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `U8e-${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(file, report);
  process.stdout.write(`Zapisano ${file}\n`);
}
process.exit(0);
