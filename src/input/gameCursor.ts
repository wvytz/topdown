// Własny kursor myszy nad grą (krok 172; od kroku 178 inny dla każdego bohatera; obrazki z tools/cursor_sprites.py).
// Sam CSS: przeglądarka rysuje kursor jak systemowy, więc gra nic nie liczy ani nie rysuje co klatkę.
// Reguły instaluje tylko wersja PC (main.ts) — telefon nie ma kursora, a setGameCursor zmienia tam tylko atrybut bez skutku.
// Okienka DOM (czat z autorem, ekran Safari) zostają przy kursorach systemu.
import { CURSOR_SPRITES, DEFAULT_CURSOR, GameCursor } from '@/config/cursorConfig';

/** Gdy obrazek się nie wczyta, przeglądarka pokaże zwykły celownik. */
const FALLBACK = 'crosshair';
const GAME_ROOT_ID = 'game';

export const cursorFile = (cursor: GameCursor, hiDpi: boolean): string => `assets/cursor/${cursor}${hiDpi ? '@2x' : ''}.png`;

const ruleFor = (base: string, cursor: GameCursor): string => {
  const { x, y } = CURSOR_SPRITES[cursor].hotspot;
  const normal = `url('${base}${cursorFile(cursor, false)}')`;
  const hiDpi = `url('${base}${cursorFile(cursor, true)}')`;
  const selector = cursor === DEFAULT_CURSOR ? `#${GAME_ROOT_ID} canvas` : `#${GAME_ROOT_ID}[data-cursor="${cursor}"] canvas`;
  // Dwie deklaracje: przeglądarka bez image-set() odrzuci drugą i zostanie przy pierwszej.
  // !important wygrywa z „rączką” Phasera (useHandCursor), którą Phaser wpisuje w styl płótna nad przyciskami.
  return [
    `${selector} {`,
    `  cursor: ${normal} ${x} ${y}, ${FALLBACK} !important;`,
    `  cursor: image-set(${normal} 1x, ${hiDpi} 2x) ${x} ${y}, ${FALLBACK} !important;`,
    '}',
  ].join('\n');
};

/** Reguła domyślna najpierw — reguły bohaterów mają ostrzejszy selektor i wygrywają, gdy atrybut jest ustawiony. */
export const gameCursorCss = (base: string): string =>
  [DEFAULT_CURSOR, ...Object.values(GameCursor).filter((cursor) => cursor !== DEFAULT_CURSOR)].map((cursor) => ruleFor(base, cursor)).join('\n');

export const installGameCursor = (doc: Document = document): void => {
  const style = doc.createElement('style');
  style.dataset.gameCursor = '';
  style.textContent = gameCursorCss(import.meta.env.BASE_URL);
  doc.head.appendChild(style);
};

/** Przełącza kursor (np. na broń bohatera na czas walki). Tylko atrybut na kontenerze gry — bez kosztu co klatkę. */
export const setGameCursor = (cursor: GameCursor, doc: Document = document): void => {
  const root = doc.getElementById(GAME_ROOT_ID);
  if (!root) return;
  if (cursor === DEFAULT_CURSOR) delete root.dataset.cursor;
  else root.dataset.cursor = cursor;
};
