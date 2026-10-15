/**
 * Wdrożenie gry na GitHub Pages (gałąź `gh-pages`): build (typy + testy + Vite), potem zawartość `dist/`
 * trafia jako jeden commit na gałąź `gh-pages` repozytorium `origin` (nadpisywana przy każdym wdrożeniu).
 * GitHub Pages serwuje ją pod https://<użytkownik>.github.io/<repo>/.
 *
 * Użycie (z katalogu głównego repozytorium):
 *   npm run deploy:pages
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

const root = process.cwd();
const remote = read('git', ['remote', 'get-url', 'origin'], root);
const source = read('git', ['rev-parse', '--short', 'HEAD'], root);
const dirty = read('git', ['status', '--porcelain'], root) !== '';

run('npm', ['run', 'build'], root);

const out = mkdtempSync(join(tmpdir(), 'tower-crawler-pages-'));
try {
  cpSync(join(root, 'dist'), out, { recursive: true });
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
}
