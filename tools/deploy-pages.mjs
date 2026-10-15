/**
 * Wdrożenie gry na GitHub Pages (gałąź `gh-pages`): build (typy + testy + Vite), potem zawartość `dist/`
 * trafia jako jeden commit na gałąź `gh-pages` repozytorium `origin` (nadpisywana przy każdym wdrożeniu).
 * GitHub Pages serwuje ją pod https://<użytkownik>.github.io/<repo>/.
 *
 * Użycie (z katalogu głównego repozytorium):
 *   npm run deploy:pages
 *   npm run deploy:pages -- --dir sterowanie   (wersja testowa w podkatalogu: …/topdown/sterowanie/)
 *
 * Z `--dir` reszta `gh-pages` zostaje (gra dla testerów się nie zmienia), a zastępowany jest tylko podkatalog.
 * Zwykłe wdrożenie nadpisuje całą gałąź — także wersje testowe w podkatalogach.
 *
 * Bez GitHub Actions (token `gh` bez uprawnienia `workflow`); `vite.config.ts` ma `base: './'`,
 * więc ścieżki do zasobów działają pod adresem podstrony.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Powłoka tylko dla npm (na Windows to plik .cmd); git bez powłoki, żeby argumenty ze spacjami się nie rozpadły.
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: cmd === 'npm' && process.platform === 'win32' });
const read = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

const dirFlag = process.argv.indexOf('--dir');
const subdir = dirFlag >= 0 ? process.argv[dirFlag + 1] : null;
if (dirFlag >= 0 && !/^[a-z0-9-]+$/.test(subdir ?? '')) throw new Error('--dir: nazwa podkatalogu (a-z, 0-9, -).');

const root = process.cwd();
const remote = read('git', ['remote', 'get-url', 'origin'], root);
const source = read('git', ['rev-parse', '--short', 'HEAD'], root);
const dirty = read('git', ['status', '--porcelain'], root) !== '';

run('npm', ['run', 'build'], root);

const out = mkdtempSync(join(tmpdir(), 'tower-crawler-pages-'));
try {
  if (subdir) {
    // Wersja testowa: bieżąca zawartość gh-pages + nowy podkatalog; zwykły push (bez nadpisywania historii).
    run('git', ['clone', '--quiet', '--depth', '1', '--branch', 'gh-pages', remote, out], root);
    rmSync(join(out, subdir), { recursive: true, force: true });
    cpSync(join(root, 'dist'), join(out, subdir), { recursive: true });
  } else {
    cpSync(join(root, 'dist'), out, { recursive: true });
    run('git', ['init', '--quiet', '--initial-branch', 'gh-pages'], out);
  }
  // Bez Jekylla: GitHub Pages ma serwować pliki dokładnie tak, jak są.
  writeFileSync(join(out, '.nojekyll'), '');
  run('git', ['add', '--all'], out);
  const target = subdir ? ` do podkatalogu ${subdir}/` : '';
  const message = `Wdrożenie gry z ${source}${target}${dirty ? ' (z niezatwierdzonymi zmianami)' : ''}`;
  run('git', ['-c', 'user.name=wvytz', '-c', `user.email=${read('git', ['config', 'user.email'], root)}`, 'commit', '--quiet', '-m', message], out);
  run('git', subdir ? ['push', '--quiet', 'origin', 'gh-pages'] : ['push', '--force', '--quiet', remote, 'gh-pages'], out);
  console.log(`Wdrożono ${source} na gałąź gh-pages${target}.`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
