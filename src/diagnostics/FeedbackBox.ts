import type { DiagnosticsHub } from '@/diagnostics/DiagnosticsHub';
import { FEEDBACK_CONFIG, FEEDBACK_TEXT } from '@/config/feedbackConfig';

const BACKDROP =
  'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(5,5,10,.55);';
const PANEL =
  'width:min(560px,100%);font:14px/1.45 monospace;color:#f1e6d2;background:rgba(18,13,12,.97);border:2px solid #5a4a2a;' +
  'border-radius:6px;padding:14px 16px;box-shadow:0 4px 24px #000c;';
const AREA =
  'display:block;width:100%;box-sizing:border-box;min-height:110px;resize:vertical;font:15px/1.4 monospace;color:#f1e6d2;' +
  'background:#0c0a09;border:1px solid #6a5a3a;border-radius:4px;padding:8px;margin:8px 0 4px;outline:none;';
const BUTTON = 'font:inherit;color:#f1e6d2;background:#3a2a20;border:1px solid #8a6a3a;border-radius:4px;padding:5px 14px;cursor:pointer;';
const COLORS = { dim: '#a8998a', ok: '#9be08a', error: '#ff8a7a', gold: '#f0c24a' } as const;

/** Po udanej wysyłce okienko znika po tylu ms (żeby tester zobaczył podziękowanie). */
const CLOSE_AFTER_SENT_MS = 1400;

/**
 * Okienko czatu „Napisz do autora” (krok 133) — warstwa DOM nad płótnem, bo tylko prawdziwe pole tekstowe
 * daje wygodne pisanie (także klawiaturę ekranową telefonu). Klawisze w okienku nie docierają do Phasera
 * (stopPropagation), więc litery nie sterują pauzą. Pad steruje okienkiem przez pauzę: A — wyślij, B — zamknij.
 */
export class FeedbackBox {
  private root: HTMLDivElement | null = null;
  private area: HTMLTextAreaElement | null = null;
  private status: HTMLDivElement | null = null;
  private counter: HTMLSpanElement | null = null;
  private onClose: (() => void) | null = null;
  private sending = false;
  private closeTimer: number | null = null;

  constructor(
    private readonly hub: DiagnosticsHub,
    private readonly mobile: boolean,
    private readonly playerName: () => string | null,
  ) {}

  get available(): boolean {
    return this.hub.canSendReports;
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(onClose: () => void): void {
    if (typeof document === 'undefined') return;
    if (this.root) return;
    this.onClose = onClose;
    this.sending = false;

    const root = document.createElement('div');
    root.setAttribute('style', BACKDROP);
    const panel = document.createElement('div');
    panel.setAttribute('style', PANEL);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', FEEDBACK_TEXT.title);

    const title = document.createElement('div');
    title.textContent = `💬 ${FEEDBACK_TEXT.title}`;
    title.setAttribute('style', `font-size:18px;color:${COLORS.gold};margin-bottom:4px;`);
    const intro = document.createElement('div');
    intro.textContent = FEEDBACK_TEXT.intro;
    intro.setAttribute('style', `color:${COLORS.dim};font-size:13px;`);

    const area = document.createElement('textarea');
    area.setAttribute('style', AREA);
    area.maxLength = FEEDBACK_CONFIG.maxChars;
    area.placeholder = FEEDBACK_TEXT.placeholder;
    area.setAttribute('aria-label', FEEDBACK_TEXT.title);

    const meta = document.createElement('div');
    meta.setAttribute('style', `display:flex;justify-content:space-between;gap:8px;color:${COLORS.dim};font-size:12px;`);
    const name = this.currentName();
    const signed = document.createElement('span');
    signed.textContent = name ? FEEDBACK_TEXT.signedAs(name) : FEEDBACK_TEXT.anonymous;
    const counter = document.createElement('span');
    meta.append(signed, counter);

    const status = document.createElement('div');
    status.setAttribute('style', 'min-height:20px;margin:6px 0;');

    const buttons = document.createElement('div');
    buttons.setAttribute('style', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;');
    const send = this.button(FEEDBACK_TEXT.send, () => void this.submit());
    send.style.borderColor = COLORS.gold;
    const cancel = this.button(FEEDBACK_TEXT.cancel, () => this.close());
    const hint = document.createElement('span');
    hint.setAttribute('style', `color:${COLORS.dim};font-size:12px;margin-left:auto;`);
    hint.textContent = this.mobile ? FEEDBACK_TEXT.mobileHint : `${FEEDBACK_TEXT.hint}\n${FEEDBACK_TEXT.padHint}`;
    hint.style.whiteSpace = 'pre-line';
    buttons.append(send, cancel, hint);

    panel.append(title, intro, area, meta, status, buttons);
    root.append(panel);

    // Klawisze w okienku zostają w okienku: Phaser nasłuchuje na `window`, a litery to skróty pauzy (P, M, N…).
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
      root.addEventListener(type, (event) => event.stopPropagation());
    }
    area.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      } else if (event.key === 'Enter' && !event.shiftKey && !this.mobile) {
        event.preventDefault();
        void this.submit();
      }
    });
    area.addEventListener('input', () => this.updateCounter());

    document.body.appendChild(root);
    this.root = root;
    this.area = area;
    this.status = status;
    this.counter = counter;
    this.updateCounter();
    if (!this.available) this.setStatus(FEEDBACK_TEXT.unavailable, COLORS.error);
    area.focus();
  }

  /** Wysyła wpisany tekst (Enter, przycisk albo A na padzie). Przy błędzie tekst zostaje w polu. */
  async submit(): Promise<void> {
    const area = this.area;
    if (!area || this.sending || this.closeTimer !== null) return;
    this.sending = true;
    this.setStatus(FEEDBACK_TEXT.sending, COLORS.dim);
    const result = await this.hub.sendFeedback(area.value);
    this.sending = false;
    if (this.area !== area) return; // okienko zamknięto w trakcie wysyłki
    if (result.ok) {
      this.setStatus(result.duplicate ? FEEDBACK_TEXT.duplicate : FEEDBACK_TEXT.sent, COLORS.ok);
      area.value = '';
      area.disabled = true;
      this.closeTimer = window.setTimeout(() => this.close(), CLOSE_AFTER_SENT_MS);
      return;
    }
    switch (result.reason) {
      case 'too-short':
        this.setStatus(FEEDBACK_TEXT.tooShort, COLORS.error);
        break;
      case 'throttled':
      case 'rate-limited':
        this.setStatus(result.retryAfterS !== undefined ? FEEDBACK_TEXT.throttled(result.retryAfterS) : FEEDBACK_TEXT.sessionLimit, COLORS.error);
        break;
      case 'unavailable':
        this.setStatus(FEEDBACK_TEXT.unavailable, COLORS.error);
        break;
      default:
        this.setStatus(FEEDBACK_TEXT.failed, COLORS.error);
    }
    area.focus();
  }

  close(): void {
    if (!this.root) return;
    if (this.closeTimer !== null) window.clearTimeout(this.closeTimer);
    this.closeTimer = null;
    this.root.remove();
    this.root = null;
    this.area = null;
    this.status = null;
    this.counter = null;
    const onClose = this.onClose;
    this.onClose = null;
    onClose?.();
  }

  private currentName(): string | null {
    try {
      return this.playerName();
    } catch {
      return null;
    }
  }

  private updateCounter(): void {
    if (this.counter && this.area) this.counter.textContent = `${[...this.area.value].length}/${FEEDBACK_CONFIG.maxChars}`;
  }

  private setStatus(text: string, color: string): void {
    if (!this.status) return;
    this.status.textContent = text;
    this.status.style.color = color;
  }

  private button(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('style', BUTTON);
    button.addEventListener('click', action);
    return button;
  }
}

/** Jedyne okienko; ustawia je `installDiagnostics`. Bez instalacji (testy) — niedostępne. */
let active: FeedbackBox | null = null;
export const setFeedbackBox = (box: FeedbackBox | null): void => {
  active = box;
};
export const feedbackUi = {
  get available(): boolean {
    return active?.available ?? false;
  },
  get isOpen(): boolean {
    return active?.isOpen ?? false;
  },
  open(onClose: () => void): void {
    active?.open(onClose);
  },
  submit(): void {
    void active?.submit();
  },
  close(): void {
    active?.close();
  },
};
