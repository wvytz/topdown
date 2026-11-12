import type Phaser from 'phaser';
import { UI_PALETTE, UI_TEXT_PLATE } from '@/config/uiConfig';

/** Wygląd ramki panelu. */
export interface FrameStyle {
  readonly fill?: number;
  readonly fillAlpha?: number;
  /** Ramka (1 px) wewnątrz obrysu. */
  readonly edge?: number;
  /** Złote nity w rogach (karty, ważne panele). */
  readonly rivets?: number | null;
  /** Fazka: jaśniejszy górny rząd wnętrza. */
  readonly bevel?: number | null;
}

/**
 * Ramka w pikselach (krok U7): obrys 1 px w barwie obrysu postaci ze ściętymi rogami, ramka 1 px, wnętrze
 * i fazka. Wszystko na całkowitych pikselach płótna — ten sam język co łupy (§6c).
 */
export function drawFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, style: FrameStyle = {}): void {
  const P = UI_PALETTE;
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  const fill = style.fill ?? P.panel;
  const edge = style.edge ?? P.edge;
  // Obrys ze ściętymi rogami.
  g.fillStyle(P.ink, 1);
  g.fillRect(x + 1, y, w - 2, 1).fillRect(x + 1, y + h - 1, w - 2, 1).fillRect(x, y + 1, 1, h - 2).fillRect(x + w - 1, y + 1, 1, h - 2);
  // Ramka.
  g.fillStyle(edge, 1);
  g.fillRect(x + 1, y + 1, w - 2, 1).fillRect(x + 1, y + h - 2, w - 2, 1).fillRect(x + 1, y + 2, 1, h - 4).fillRect(x + w - 2, y + 2, 1, h - 4);
  // Wnętrze.
  g.fillStyle(fill, style.fillAlpha ?? P.panelAlpha).fillRect(x + 2, y + 2, w - 4, h - 4);
  if (style.bevel !== null) g.fillStyle(style.bevel ?? P.panelLight, 0.9).fillRect(x + 2, y + 2, w - 4, 1);
  if (style.rivets !== undefined && style.rivets !== null) {
    g.fillStyle(style.rivets, 1);
    for (const [rx, ry] of [[x + 1, y + 1], [x + w - 3, y + 1], [x + 1, y + h - 3], [x + w - 3, y + h - 3]] as const) g.fillRect(rx, ry, 2, 2);
  }
}

/** Rampa paska: światło (górny rząd), barwa i cień (dolny rząd). */
export interface BarRamp {
  readonly light: number;
  readonly base: number;
  readonly dark: number;
}

/**
 * Pasek w pikselach (krok U7): obrys 1 px, ciemne tło, wypełnienie z rampą 3 tonów. `ratio` 0..1.
 * Wypełnienie zaokrąglone do pełnych pikseli, żeby krawędź nie migotała.
 */
export function drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, ratio: number, ramp: BarRamp, back: number = UI_PALETTE.void): void {
  x = Math.round(x);
  y = Math.round(y);
  g.fillStyle(UI_PALETTE.ink, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(back, 1).fillRect(x, y, w, h);
  const fill = Math.round(w * Math.max(0, Math.min(1, ratio)));
  if (fill <= 0) return;
  g.fillStyle(ramp.base, 1).fillRect(x, y, fill, h);
  if (h >= 3) {
    g.fillStyle(ramp.light, 1).fillRect(x, y, fill, 1);
    g.fillStyle(ramp.dark, 1).fillRect(x, y + h - 1, fill, 1);
  }
}

/** Rampa z jednej barwy: jaśniej i ciemniej o stałe kroki (bez czystej bieli i czerni). */
export function rampOf(base: number): BarRamp {
  const shift = (color: number, k: number): number => {
    const ch = (s: number) => {
      const v = (color >> s) & 0xff;
      const out = k > 0 ? v + (255 - v) * k : v * (1 + k);
      return Math.max(16, Math.min(240, Math.round(out))) << s;
    };
    return ch(16) | ch(8) | ch(0);
  };
  return { light: shift(base, 0.35), base, dark: shift(base, -0.35) };
}

/** Napis, pod którym można położyć podkładkę: pozycja, wymiary, kotwica, widoczność. */
interface PlatedText {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  readonly alpha: number;
  readonly visible: boolean;
  readonly text: string;
}

/**
 * Podkładka pod napisem HUD-u (krok U7a): ciemny prostokąt ze ściętymi rogami — litera odcina się od
 * jasnej posadzki, a sama podkładka znika razem z napisem (ta sama alfa).
 */
export function drawTextPlate(g: Phaser.GameObjects.Graphics, text: PlatedText, alpha = 1): void {
  if (!text.visible || text.text === '' || text.alpha <= 0.02) return;
  const P = UI_TEXT_PLATE;
  const x = Math.round(text.x - text.originX * text.width) - P.padX;
  const y = Math.round(text.y - text.originY * text.height) - P.padY;
  const w = Math.round(text.width) + P.padX * 2;
  const h = Math.round(text.height) + P.padY * 2;
  g.fillStyle(P.color, P.alpha * text.alpha * alpha);
  g.fillRect(x + 1, y, w - 2, h);
  g.fillRect(x, y + 1, 1, h - 2);
  g.fillRect(x + w - 1, y + 1, 1, h - 2);
}
