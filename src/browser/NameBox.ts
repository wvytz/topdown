import { HIGHSCORE_CONFIG } from '@/config/lootConfig';
import { NAME_BOX_TEXT, NAME_FILTER_CONFIG } from '@/config/nameFilterConfig';
import { isNameAllowed } from '@/systems/NameFilter';
import { sanitizePlayerName } from '@/systems/Highscores';

const BACKDROP =
  'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(5,5,10,.55);';
const PANEL =
  'width:min(420px,100%);font:14px/1.45 monospace;color:#f1e6d2;background:rgba(18,13,12,.97);border:2px solid #5a4a2a;' +
  'border-radius:6px;padding:14px 16px;box-shadow:0 4px 24px #000c;';
const INPUT =
  'display:block;width:100%;box-sizing:border-box;font:18px/1.4 monospace;color:#f1e6d2;background:#0c0a09;' +
  'border:1px solid #6a5a3a;border-radius:4px;padding:8px;margin:10px 0 6px;outline:none;';
const BUTTON = 'font:inherit;color:#f1e6d2;background:#3a2a20;border:1px solid #8a6a3a;border-radius:4px;padding:5px 14px;cursor:pointer;';
const COLORS = { dim: '#a8998a', error: '#ff8a7a', gold: '#f0c24a' } as const;

/** Gdzie okienko trzyma imię — `PlayerName` z magazynu przeglądarki. */
export interface NameStore {
  load(): string | null;
  save(name: string): void;
}

/**
 * Okienko zmiany imienia (krok U9b) — warstwa DOM nad płótnem (jak „Napisz do autora”), bo tylko prawdziwe pole
 * daje klawiaturę ekranową na telefonie. Imię przechodzi przez czyszczenie znaków i filtr wulgaryzmów; puste pole
 * czyści imię. Klawisze w okienku nie docierają do Phasera; pad steruje nim przez pauzę: A — zapisz, B — anuluj.
 */
export class NameBox {
  private root: HTMLDivElement | null = null;
  private input: HTMLInputElement | null = null;
  private status: HTMLDivElement | null = null;
  private onClose: (() => void) | null = null;

  constructor(private readonly store: NameStore) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(onClose: () => void): void {
    if (typeof document === 'undefined' || this.root) return;
    this.onClose = onClose;
    const root = document.createElement('div');
    root.setAttribute('style', BACKDROP);
    const panel = document.createElement('div');
    panel.setAttribute('style', PANEL);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', NAME_BOX_TEXT.title);

    const title = document.createElement('div');
    title.textContent = NAME_BOX_TEXT.title;
    title.setAttribute('style', `font-size:18px;color:${COLORS.gold};margin-bottom:4px;`);
    const intro = document.createElement('div');
    intro.textContent = NAME_BOX_TEXT.intro;
    intro.setAttribute('style', `color:${COLORS.dim};font-size:13px;`);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = HIGHSCORE_CONFIG.nameMaxLength;
    input.value = this.store.load() ?? '';
    input.autocomplete = 'off';
    input.setAttribute('style', INPUT);
    input.setAttribute('aria-label', NAME_BOX_TEXT.title);

    const status = document.createElement('div');
    status.setAttribute('style', `min-height:18px;font-size:13px;color:${COLORS.error};`);

    const buttons = document.createElement('div');
    buttons.setAttribute('style', 'display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;');
    const save = document.createElement('button');
    save.textContent = NAME_BOX_TEXT.save;
    save.setAttribute('style', BUTTON);
    save.addEventListener('click', () => this.submit());
    const cancel = document.createElement('button');
    cancel.textContent = NAME_BOX_TEXT.cancel;
    cancel.setAttribute('style', BUTTON);
    cancel.addEventListener('click', () => this.close());
    const hint = document.createElement('span');
    hint.textContent = NAME_BOX_TEXT.padHint;
    hint.setAttribute('style', `color:${COLORS.dim};font-size:12px;`);
    buttons.append(save, cancel, hint);

    panel.append(title, intro, input, status, buttons);
    root.append(panel);
    for (const type of ['keydown', 'keyup', 'keypress'] as const) root.addEventListener(type, (event) => event.stopPropagation());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.submit();
      else if (event.key === 'Escape') this.close();
    });
    root.addEventListener('pointerdown', (event) => {
      if (event.target === root) this.close();
    });
    document.body.appendChild(root);
    this.root = root;
    this.input = input;
    this.status = status;
    input.focus();
    input.select();
  }

  /** Zapis: puste pole czyści imię; imię z filtra — komunikat i okienko zostaje. */
  submit(): void {
    if (!this.input) return;
    const name = sanitizePlayerName(this.input.value, HIGHSCORE_CONFIG.nameMaxLength);
    if (!isNameAllowed(name, NAME_FILTER_CONFIG)) {
      if (this.status) this.status.textContent = NAME_BOX_TEXT.rejected;
      this.input.focus();
      return;
    }
    this.store.save(name);
    this.close();
  }

  close(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    this.input = null;
    this.status = null;
    const onClose = this.onClose;
    this.onClose = null;
    onClose?.();
  }
}
