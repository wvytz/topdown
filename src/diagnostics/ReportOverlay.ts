import type { DiagnosticsHub } from '@/diagnostics/DiagnosticsHub';
import type { AutoReportConsentStore } from '@/persistence/AutoReportConsent';

const STYLE =
  'position:fixed;left:8px;bottom:8px;z-index:99999;max-width:min(520px,calc(100vw - 16px));font:12px/1.4 monospace;color:#f4e9d0;' +
  'background:rgba(20,10,14,.94);border:1px solid #a33;border-radius:4px;padding:8px 10px;box-shadow:0 2px 12px #000a;';
const BUTTON =
  'font:inherit;color:#f4e9d0;background:#3a2a30;border:1px solid #777;border-radius:3px;padding:2px 8px;margin-right:6px;cursor:pointer;';

/**
 * Nakładka DOM z komunikatem o błędzie i raportem do skopiowania (krok 55). Nie blokuje gry (poza polem raportu
 * otwartym klawiszem F9); pokazuje się przy pierwszym błędzie sesji i po F9.
 */
export class ReportOverlay {
  private banner: HTMLDivElement | null = null;
  private panel: HTMLDivElement | null = null;

  private consentBox: HTMLDivElement | null = null;
  private notice: HTMLDivElement | null = null;

  constructor(
    private readonly hub: DiagnosticsHub,
    private readonly consent: AutoReportConsentStore,
  ) {}

  showError(message: string): void {
    if (typeof document === 'undefined') return;
    if (this.banner) {
      const line = this.banner.querySelector('[data-line]');
      if (line) line.textContent = message;
      return;
    }
    const banner = document.createElement('div');
    banner.setAttribute('style', STYLE);
    banner.innerHTML = '<div style="color:#ff9b8a;margin-bottom:4px">Wystąpił błąd w grze — raport zapisano.</div><div data-line style="opacity:.8;margin-bottom:6px;word-break:break-word"></div>';
    banner.querySelector('[data-line]')!.textContent = message;
    const copy = this.button('Kopiuj raport', () => void this.copy(copy));
    const show = this.button('Pokaż', () => this.togglePanel());
    const rec = this.button('Kopiuj nagranie', () => void this.copyRecording(rec));
    const close = this.button('Zamknij', () => {
      banner.remove();
      this.banner = null;
    });
    banner.append(copy, show, rec, close);
    document.body.appendChild(banner);
    this.banner = banner;
  }

  /** Krótka informacja (np. „Raport o awarii wysłano autorowi”), znika po kilku sekundach. */
  showNotice(text: string): void {
    if (typeof document === 'undefined') return;
    this.notice?.remove();
    const notice = document.createElement('div');
    notice.setAttribute('style', `${STYLE}border-color:#6a8;`);
    notice.textContent = text;
    document.body.appendChild(notice);
    this.notice = notice;
    window.setTimeout(() => {
      if (this.notice === notice) {
        notice.remove();
        this.notice = null;
      }
    }, 6000);
  }

  /**
   * Pytanie o zgodę na automatyczne wysyłanie raportów o awariach (krok 58), zadawane raz — przy pierwszej awarii.
   * Treść mówi wprost, co jest wysyłane. `onAnswer(true)` = wyślij też ten raport teraz.
   */
  askConsent(reason: string, onAnswer: (sendNow: boolean) => void): void {
    if (typeof document === 'undefined' || this.consentBox) return;
    const box = document.createElement('div');
    box.setAttribute('style', `${STYLE}left:auto;right:8px;max-width:min(460px,calc(100vw - 16px));`);
    const title = document.createElement('div');
    title.setAttribute('style', 'color:#ffd98a;margin-bottom:4px');
    title.textContent = reason;
    const body = document.createElement('div');
    body.setAttribute('style', 'opacity:.85;margin-bottom:6px');
    body.textContent =
      'Czy wysyłać autorowi gry raporty o awariach automatycznie? Wysyłane są: informacje o przeglądarce i ekranie, zdarzenia i stan gry oraz nagranie ruchów i kliknięć z ostatniego piętra. Bez imienia i adresu IP. Możesz to zmienić w panelu F9.';
    const close = () => {
      box.remove();
      this.consentBox = null;
    };
    const yes = this.button('Tak, wysyłaj', () => {
      this.consent.save('yes');
      close();
      onAnswer(true);
    });
    const once = this.button('Tylko ten raz', () => {
      close();
      onAnswer(true);
    });
    const no = this.button('Nie', () => {
      this.consent.save('no');
      close();
      onAnswer(false);
    });
    box.append(title, body, yes, once, no);
    document.body.appendChild(box);
    this.consentBox = box;
  }

  togglePanel(): void {
    if (typeof document === 'undefined') return;
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
      return;
    }
    const panel = document.createElement('div');
    panel.setAttribute('style', `${STYLE}left:8px;top:8px;bottom:auto;max-width:min(760px,calc(100vw - 16px));`);
    const area = document.createElement('textarea');
    area.readOnly = true;
    area.value = this.hub.report();
    area.setAttribute('style', 'display:block;width:min(740px,calc(100vw - 40px));height:min(60vh,420px);font:11px/1.35 monospace;background:#120b0e;color:#f4e9d0;border:1px solid #555;');
    const copy = this.button('Kopiuj raport', () => void this.copy(copy, area));
    const rec = this.button('Kopiuj nagranie', () => void this.copyRecording(rec));
    const close = this.button('Zamknij (F9)', () => this.togglePanel());
    const bar = document.createElement('div');
    bar.style.marginTop = '6px';
    bar.append(copy, rec, close);
    panel.append(area, bar);
    if (this.hub.canSendReports) panel.append(this.sendControls());
    document.body.appendChild(panel);
    this.panel = panel;
    area.focus();
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = label;
    button.setAttribute('style', BUTTON);
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Wysyłka raportu autorowi (krok 57): ręczna, z jasną informacją o zawartości; opcja dołączenia nagrania wejść.
   * Wynik (wysłano / za często / błąd sieci) pokazuje się obok przycisku.
   */
  private sendControls(): HTMLDivElement {
    const box = document.createElement('div');
    box.setAttribute('style', 'margin-top:8px;padding-top:6px;border-top:1px solid #555;');
    const note = document.createElement('div');
    note.setAttribute('style', 'opacity:.75;margin-bottom:4px;max-width:720px');
    const auto = document.createElement('label');
    auto.setAttribute('style', 'display:block;margin-bottom:4px;cursor:pointer');
    const autoCheck = document.createElement('input');
    autoCheck.type = 'checkbox';
    autoCheck.checked = this.consent.load() === 'yes';
    autoCheck.addEventListener('change', () => this.consent.save(autoCheck.checked ? 'yes' : 'no'));
    auto.append(autoCheck, document.createTextNode(' wysyłaj raporty o awariach automatycznie (z nagraniem ruchów i kliknięć)'));
    note.textContent =
      'Wysyłane: raport tekstowy powyżej (przeglądarka, rozdzielczość, zdarzenia i stan gry) oraz losowy anonimowy identyfikator przeglądarki. Bez imienia i adresu IP.';
    const label = document.createElement('label');
    label.setAttribute('style', 'margin-right:8px;cursor:pointer');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = true;
    label.append(check, document.createTextNode(' dołącz nagranie wejść z ostatniego piętra (ruchy i kliknięcia)'));
    const status = document.createElement('span');
    const send = this.button('Wyślij autorowi', () => {
      send.disabled = true;
      status.textContent = 'Wysyłam…';
      void this.hub.sendReport('diagnostic', check.checked).then((result) => {
        send.disabled = false;
        status.textContent = result.ok ? (result.duplicate ? 'Ten raport już wysłano.' : 'Wysłano — dziękuję!') : this.describeFailure(result.reason, result.retryAfterS);
      });
    });
    box.append(note, auto, label, send, status);
    return box;
  }

  private describeFailure(reason: string, retryAfterS?: number): string {
    const wait = retryAfterS !== undefined ? ` Spróbuj za ${retryAfterS >= 120 ? `${Math.round(retryAfterS / 60)} min` : `${retryAfterS} s`}.` : '';
    switch (reason) {
      case 'throttled':
        return `Za często — raport można wysłać co minutę (maks. 3 na sesję).${wait}`;
      case 'rate-limited':
        return `Limit wysyłek wyczerpany.${wait}`;
      case 'unavailable':
        return `Serwis chwilowo niedostępny.${wait}`;
      case 'too-large':
        return 'Raport za duży — odznacz nagranie wejść i spróbuj ponownie.';
      case 'network':
        return 'Brak połączenia — spróbuj później.';
      default:
        return 'Serwer odrzucił raport.';
    }
  }

  /** Nagranie wejść z ostatniego piętra jako JSON (do odtworzenia w trybie dev przez `__replay`). */
  private async copyRecording(button: HTMLButtonElement): Promise<void> {
    const json = this.hub.lastRecordingJson();
    if (!json) {
      button.textContent = 'Brak nagrania';
      return;
    }
    try {
      await navigator.clipboard.writeText(json);
      button.textContent = 'Skopiowano nagranie';
    } catch {
      window.prompt('Skopiuj nagranie (Ctrl+C):', json);
    }
  }

  private async copy(button: HTMLButtonElement, area?: HTMLTextAreaElement): Promise<void> {
    const text = this.hub.report();
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Skopiowano';
    } catch {
      // Bez uprawnień do schowka: zaznaczamy tekst, użytkownik skopiuje Ctrl+C.
      if (!this.panel) this.togglePanel();
      (area ?? this.panel?.querySelector('textarea'))?.select();
      button.textContent = 'Zaznacz i Ctrl+C';
    }
  }
}
