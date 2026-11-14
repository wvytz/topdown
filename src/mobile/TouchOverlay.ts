import type { ScreenButton, ScreenSize } from '@/systems/touchLayout';
import { layoutLine, measureLine } from '@/core/pixelFont';

/** Gałka do narysowania: środek, pozycja gałki pod kciukiem i promień (px CSS). */
export interface OverlayStick {
  readonly originX: number;
  readonly originY: number;
  readonly knobX: number;
  readonly knobY: number;
  readonly radius: number;
}

export interface OverlayButton extends ScreenButton {
  readonly label: string;
  /** Wypełnienie: zwykłe, wciśnięte (atak trwa) albo gotowe (ultimate). */
  readonly state: 'idle' | 'active' | 'ready';
  /** Duże kółko ataku: grubsza obwódka i większy napis. */
  readonly primary?: boolean;
}

export interface OverlayFrame {
  readonly buttons: readonly OverlayButton[];
  readonly sticks: readonly OverlayStick[];
  /** Blada podpowiedź gałki ruchu, gdy kciuk jej nie trzyma. */
  readonly restHint: OverlayStick | null;
}

const FILL = { idle: 'rgba(32, 32, 48, 0.45)', active: 'rgba(57, 192, 216, 0.75)', ready: 'rgba(231, 177, 64, 0.8)' } as const;

/**
 * Warstwa rysunku sterowania dotykowego (krok 141): przezroczyste płótno 2D na całym ekranie, nad grą.
 * Phaser rysuje tylko na swoim płótnie 16:9, a przyciski leżą przy krawędziach ekranu — często w czarnych
 * pasach obok płótna gry. Warstwa nie łapie dotyku (`pointer-events: none`) — dotyk czyta TouchScene.
 */
export class TouchOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private size: ScreenSize = { width: 0, height: 0 };
  private dpr = 1;
  private empty = true;
  /** Próbnik bezpiecznego obszaru (wcięcie, pasek „home” na iPhonie) — padding z `env(safe-area-inset-*)`. */
  private readonly safeProbe: HTMLDivElement;
  private insets = { left: 0, right: 0, bottom: 0 };

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '5' });
    parent.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('TouchOverlay: brak kontekstu 2D.');
    this.ctx = ctx;
    this.safeProbe = document.createElement('div');
    Object.assign(this.safeProbe.style, {
      position: 'fixed',
      visibility: 'hidden',
      pointerEvents: 'none',
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    });
    parent.appendChild(this.safeProbe);
  }

  /** Wcięcia bezpiecznego obszaru (px CSS): przyciski i gałka nie wchodzą pod wcięcie ekranu ani pasek „home”. */
  get safeArea(): { readonly left: number; readonly right: number; readonly bottom: number } {
    return this.insets;
  }

  /** Rozmiar warstwy w pikselach CSS (= rozmiar strony). */
  get screen(): ScreenSize {
    return this.size;
  }

  /** Dopasowanie do ekranu (obrót, pasek adresu) — wywoływać co klatkę, tanie, gdy nic się nie zmieniło. */
  fit(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    if (width === this.size.width && height === this.size.height && dpr === this.dpr) return;
    const style = getComputedStyle(this.safeProbe);
    this.insets = { left: parseFloat(style.paddingLeft) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
    this.size = { width, height };
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.empty = false;
  }

  draw(frame: OverlayFrame | null): void {
    const { ctx } = this;
    if (!frame) {
      if (this.empty) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.empty = true;
      return;
    }
    this.empty = false;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.size.width, this.size.height);
    if (frame.restHint) this.drawStick(frame.restHint, 0.35);
    for (const button of frame.buttons) this.drawButton(button);
    for (const stick of frame.sticks) this.drawStick(stick, 1);
  }

  private drawButton(button: OverlayButton): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(button.x, button.y, button.radius, 0, Math.PI * 2);
    ctx.fillStyle = FILL[button.state];
    ctx.fill();
    ctx.lineWidth = button.primary ? 3 : 2;
    ctx.strokeStyle = button.primary ? 'rgba(232, 232, 240, 0.75)' : 'rgba(232, 232, 240, 0.55)';
    ctx.stroke();
    // Krok U7: podpis przycisku w pikselowym kroju gry (obrys 1 piksel fontu), nie czcionką systemową.
    drawPixelLabel(ctx, button.label, button.x, button.y, button.primary ? 3 : 2);
  }

  /** Gałka: tarcza z obwódką i kółko pod kciukiem; `alpha` < 1 — blada podpowiedź. */
  private drawStick(stick: OverlayStick, alpha: number): void {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(stick.originX, stick.originY, stick.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(32, 32, 48, 0.3)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(232, 232, 240, 0.45)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(stick.knobX, stick.knobY, stick.radius * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232, 232, 240, 0.55)';
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** Napis pikselowym krojem (krok U7) wyśrodkowany w (x, y); `unit` — bok piksela fontu w px CSS. */
function drawPixelLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, unit: number): void {
  const lines = label.split('\n');
  const lineHeight = (GLYPH_CAP_ROWS + 3) * unit;
  lines.forEach((line, i) => {
    const pixels = layoutLine(line);
    const left = Math.round(x - (measureLine(line) * unit) / 2);
    const top = Math.round(y - (lines.length * lineHeight) / 2 + i * lineHeight + (lineHeight - GLYPH_CAP_ROWS * unit) / 2);
    ctx.fillStyle = '#1b1a22';
    for (const p of pixels) ctx.fillRect(left + (p.x - 1) * unit, top + (p.y - 1) * unit, unit * 3, unit * 3);
    ctx.fillStyle = '#e8e0c0';
    for (const p of pixels) ctx.fillRect(left + p.x * unit, top + p.y * unit, unit, unit);
  });
}

/** Wysokość wersalika w pikselach fontu. */
const GLYPH_CAP_ROWS = 7;
