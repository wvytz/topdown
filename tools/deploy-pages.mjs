/**
 * Wdrożenie gry na GitHub Pages (gałąź `gh-pages`): build (typy + testy + Vite), potem zawartość `dist/`
 * trafia jako jeden commit na gałąź `gh-pages` repozytorium `origin` (nadpisywana przy każdym wdrożeniu).
 * GitHub Pages serwuje ją pod https://<użytkownik>.github.io/<repo>/.
 *
 * Użycie (z katalogu głównego repozytorium):
 *   npm run deploy:pages
 *   npm run deploy:pages -- --subdir coop   (krok 109: wersja testowa z gałęzi w podkatalogu, np. /topdown/coop/;
 *                                            reszta `gh-pages` zostaje — główna gra bez zmian)
 *   npm run deploy:pages -- --subdir upgrade --with-scores   (podgląd z prawdziwymi tablicami — tylko świadomie)
 *
 * Krok U0:
 * - wersja w podkatalogu budowana jest domyślnie BEZ adresu workera (`VITE_SCORES_URL` pusty, nawet gdy jest
 *   `.env.production`): wyniki z podglądu zostają w przeglądarce i nie trafiają na prawdziwe tablice;
 * - wersja w podkatalogu ma własny przedrostek kluczy localStorage (`<subdir>:`) — nie rusza zapisów głównej gry;
 * - zwykłe wdrożenie (z `main`) zachowuje podkatalogi z wersjami testowymi (`coop/`, `upgrade/`…), które już są na
 *   `gh-pages` — wcześniej nadpisanie gałęzi je kasowało.
 *
 * Bez GitHub Actions (token `gh` bez uprawnienia `workflow`); `vite.config.ts` ma `base: './'`,
 * więc ścieżki do zasobów działają pod adresem podstrony.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Powłoka tylko dla npm (na Windows to plik .cmd); git bez powłoki, żeby argumenty ze spacjami się nie rozpadły.
const run = (cmd, args, cwd, env) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: cmd === 'npm' && process.platform === 'win32', env: env ?? process.env });
const read = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

const root = process.cwd();
const remote = read('git', ['remote', 'get-url', 'origin'], root);
const source = read('git', ['rev-parse', '--short', 'HEAD'], root);
const dirty = read('git', ['status', '--porcelain'], root) !== '';

const subdirIndex = process.argv.indexOf('--subdir');
const subdir = subdirIndex >= 0 ? process.argv[subdirIndex + 1] : null;
if (subdir !== null && !/^[a-z0-9-]+$/.test(subdir ?? '')) throw new Error('--subdir: tylko małe litery, cyfry i „-”.');

const withScores = subdir === null || process.argv.includes('--with-scores');
// Pusta zmienna środowiska ma pierwszeństwo przed `.env.production` (zasada Vite) — gra wtedy nie zna workera.
// Podgląd w podkatalogu leży w tym samym pochodzeniu co gra testerów (wspólny localStorage), więc dostaje własny
// przedrostek kluczy: zapisy, lokalne tablice i ustawienia głównej gry zostają nietknięte (`persistence/scopedStorage.ts`).
const env = { ...process.env, ...(subdir ? { VITE_STORAGE_PREFIX: `${subdir}:` } : {}), ...(withScores ? {} : { VITE_SCORES_URL: '' }) };
run('npm', ['run', 'build'], root, env);
if (!withScores) console.log(`Podgląd /${subdir}/ zbudowany bez workera — wyniki tylko lokalne.`);

if (subdir) {
  // Podkatalog: klon obecnej gałęzi gh-pages, wymiana tylko `<subdir>/`, zwykły push (bez nadpisywania historii).
  const out = mkdtempSync(join(tmpdir(), 'tower-crawler-pages-'));
  try {
    run('git', ['clone', '--quiet', '--depth', '1', '--branch', 'gh-pages', remote, out], root);
    const target = join(out, subdir);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    cpSync(join(root, 'dist'), target, { recursive: true });
    run('git', ['add', '--all'], out);
    const message = `Wersja testowa /${subdir}/ z ${source}${dirty ? ' (z niezatwierdzonymi zmianami)' : ''}`;
    run('git', ['-c', 'user.name=wvytz', '-c', `user.email=${read('git', ['config', 'user.email'], root)}`, 'commit', '--quiet', '-m', message], out);
    run('git', ['push', '--quiet', remote, 'gh-pages'], out);
    console.log(`Wdrożono ${source} do /${subdir}/ na gałęzi gh-pages.`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  process.exit(0);
}

/**
 * Podkatalogi wersji testowych z obecnej gałęzi `gh-pages` (katalog z własnym `index.html`, którego nie ma w `dist/`).
 * Zwraca ścieżkę klonu (do sprzątnięcia) i listę nazw; brak gałęzi = pusta lista.
 */
function previewDirs() {
  const clone = mkdtempSync(join(tmpdir(), 'tower-crawler-pages-old-'));
  try {
    execFileSync('git', ['clone', '--quiet', '--depth', '1', '--branch', 'gh-pages', remote, clone], { stdio: 'ignore' });
  } catch {
    return { clone, dirs: [] };
  }
  const built = new Set(readdirSync(join(root, 'dist')));
  const dirs = readdirSync(clone).filter(
    (name) => !name.startsWith('.') && !built.has(name) && statSync(join(clone, name)).isDirectory() && existsSync(join(clone, name, 'index.html')),
  );
  return { clone, dirs };
}

const out = mkdtempSync(join(tmpdir(), 'tower-crawler-pages-'));
const kept = previewDirs();
try {
  cpSync(join(root, 'dist'), out, { recursive: true });
  for (const name of kept.dirs) cpSync(join(kept.clone, name), join(out, name), { recursive: true });
  if (kept.dirs.length) console.log(`Zachowane wersje testowe: ${kept.dirs.map((d) => `/${d}/`).join(', ')}`);
  // Bez Jekylla: GitHub Pages ma serwować pliki dokładnie tak, jak są.
  writeFileSync(join(out, '.nojekyll'), '');
  run('git', ['init', '--quiet', '--initial-branch', 'gh-pages'], out);
  run('git', ['add', '--all'], out);
  const message = `Wdrożenie gry z ${source}${dirty ? ' (z niezatwierdzonymi zmianami)' : ''}`;
  run('git', ['-c', 'user.name=wvytz', '-c', `user.email=${read('git', ['config', 'user.email'], root)}`, 'commit', '--quiet', '-m', message], out);
  run('git', ['push', '--force', '--quiet', remote, 'gh-pages'], out);
  console.log(`Wdrożono ${source} na gałąź gh-pages.`);
} finally {
  rmSync(out, { recursive: true, force: true });
  rmSync(kept.clone, { recursive: true, force: true });
}
