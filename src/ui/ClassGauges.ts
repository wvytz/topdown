import type Phaser from 'phaser';
import { HUD_GAUGES, type GaugePalette, type GaugeTheme } from '@/config/hudGaugeConfig';
import { UI_PALETTE } from '@/config/uiConfig';
import { pixelLine } from '@/core/pixelArt';
import type { BeamHudData, RangedHudData } from '@/core/types';
import { bowPull, filledRows, flowStart, heartbeatLevel, sparklePositions, stringSag } from '@/systems/hudGauges';

/**
 * Żywe wskaźniki bohatera pod paskiem zdrowia (krok U7e): dash, promień i ładunki strzału rysowane w motywie klasy
 * (`config/hudGaugeConfig.ts`). Ruch liczy `systems/hudGauges.ts`, tu tylko piksele.
 */

interface Px {
  readonly x: number;
  readonly y: number;
  readonly color: number;
  readonly alpha?: number;
}

const G = HUD_GAUGES;
const INK = UI_PALETTE.ink;

/** Piksele z obrysem krzyżem w czerni obrysu (jak litery i łupy). */
function drawPixels(g: Phaser.GameObjects.Graphics, pixels: readonly Px[], x: number, y: number, unit: number): void {
  g.fillStyle(INK, 1);
  for (const p of pixels) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) g.fillRect(x + (p.x + dx) * unit, y + (p.y + dy) * unit, unit, unit);
  }
  for (const p of pixels) {
    g.fillStyle(p.color, p.alpha ?? 1);
    g.fillRect(x + p.x * unit, y + p.y * unit, unit, unit);
  }
}

/** Rurka paska: obrys, ciemne tło. */
function tube(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, pal: GaugePalette): void {
  g.fillStyle(INK, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(pal.dark, 1).fillRect(x, y, w, h);
}

export interface DashGaugeState {
  readonly readiness: number;
  readonly time: number;
  /** Ile ms temu dash stał się gotowy (null — dawno albo nie wiadomo). */
  readonly sinceReadyMs: number | null;
  readonly calm: boolean;
}

/** Dash w motywie klasy: żyła z krwią, strumień magii albo cięciwa. */
export function drawDashGauge(g: Phaser.GameObjects.Graphics, theme: GaugeTheme, x: number, y: number, w: number, state: DashGaugeState): void {
  if (theme === 'bowstring') {
    drawBowstring(g, x, y, w, state);
    return;
  }
  if (theme === 'blood') drawVein(g, x, y, w, state);
  else drawStream(g, x, y, w, state.readiness, state.time, false);
}

function drawVein(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, { readiness, time, calm }: DashGaugeState): void {
  const pal = G.palettes.blood;
  const h = G.bar.height;
  tube(g, x, y, w, h, pal);
  const filled = Math.round(w * Math.min(1, readiness));
  if (filled <= 0) return;
  const ready = readiness >= 1;
  g.fillStyle(ready ? pal.base : pal.deep, 1).fillRect(x, y, filled, h);
  g.fillStyle(ready ? pal.bright : pal.base, 1).fillRect(x, y, filled, 1);
  g.fillStyle(pal.deep, 1).fillRect(x, y + h - 1, filled, 1);
  if (!ready) {
    // Krew płynie żyłą: jaśniejszy odcinek wędruje do czoła wypełnienia.
    const start = flowStart(time, filled);
    const from = Math.max(0, start);
    const to = Math.min(filled, start + G.flow.lengthPx);
    if (to > from) g.fillStyle(pal.bright, 1).fillRect(x + from, y + 1, to - from, h - 2);
    return;
  }
  // Gotowa: żyła bije jak serce.
  if (!calm && heartbeatLevel(time) > 0) g.fillStyle(pal.glint, G.heartbeat.glow).fillRect(x, y, filled, h - 1);
}

/** Strumień magii: wypełnienie z iskrami płynącymi w prawo; `active` — promień właśnie działa (jaśniej). */
function drawStream(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, readiness: number, time: number, active: boolean): void {
  const pal = G.palettes.arcane;
  const h = G.bar.height;
  tube(g, x, y, w, h, pal);
  const filled = Math.round(w * Math.max(0, Math.min(1, readiness)));
  if (filled <= 0) return;
  const ready = readiness >= 1 || active;
  g.fillStyle(ready ? pal.base : pal.deep, 1).fillRect(x, y, filled, h);
  g.fillStyle(active ? pal.glint : ready ? pal.bright : pal.base, 1).fillRect(x, y, filled, 1);
  sparklePositions(time * (active ? 2 : 1), filled).forEach((sx, i) => {
    g.fillStyle(pal.glint, ready ? 1 : 0.6).fillRect(x + sx, y + 1 + (i % 2), 1, 1);
  });
}

/** Cięciwa łucznika: luźna zwisa, gdy dash się ładuje; napięta — prosta, jasna, chwilę drga. */
function drawBowstring(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, { readiness, sinceReadyMs }: DashGaugeState): void {
  const pal = G.palettes.bowstring;
  const filled = Math.round(w * Math.min(1, readiness));
  const mid = y + 1;
  // Końce ramion łuku, do których przywiązana jest cięciwa.
  for (const ex of [x - 2, x + w]) {
    g.fillStyle(INK, 1).fillRect(ex - 1, mid - 2, 4, 6);
    g.fillStyle(pal.base, 1).fillRect(ex, mid - 1, 2, 4);
    g.fillStyle(pal.bright, 1).fillRect(ex, mid - 1, 2, 1);
  }
  for (let i = 0; i < w; i++) {
    const sy = mid + stringSag(i, w, readiness, sinceReadyMs);
    g.fillStyle(INK, 1).fillRect(x + i, sy - 1, 1, 3);
  }
  for (let i = 0; i < w; i++) {
    const sy = mid + stringSag(i, w, readiness, sinceReadyMs);
    const color = readiness >= 1 ? pal.bright : i < filled ? pal.base : pal.deep;
    g.fillStyle(color, 1).fillRect(x + i, sy, 1, 1);
  }
}

/** Promień Czarodziejki: drugi strumień magii. */
export function drawBeamGauge(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, beam: BeamHudData, time: number): void {
  drawStream(g, x, y, w, beam.readiness, time, beam.active);
}

/** Szerokość i wysokość ikony ładunku (piksele ikony, przed skalą). */
export function chargeIconSize(theme: GaugeTheme): { readonly width: number; readonly height: number } {
  if (theme === 'bowstring') return { width: G.bow.width, height: G.bow.height };
  const pattern = theme === 'blood' ? G.drop : G.orb;
  return { width: pattern[0]?.length ?? 0, height: pattern.length };
}

/** Ładunki strzału (u Czarodziejki — kule): krople krwi, kule magii albo naciągane łuki. */
export function drawChargeIcons(g: Phaser.GameObjects.Graphics, theme: GaugeTheme, x: number, y: number, ranged: RangedHudData, time: number, unit = 1): void {
  const size = chargeIconSize(theme);
  const count = Math.max(0, ranged.maxCharges);
  for (let i = 0; i < count; i++) {
    const progress = i < ranged.charges ? 1 : i === ranged.charges ? ranged.rechargeProgress : 0;
    const ix = x + i * (size.width + G.icons.gap) * unit;
    const pixels = theme === 'bowstring' ? bowPixels(progress) : fillPixels(theme, progress, time, i);
    drawPixels(g, pixels, ix, y + (G.bow.height - size.height) * unit, unit);
  }
}

/** Kropla albo kula wypełniona od dołu; pełna ma odblask, który u kul migocze. */
function fillPixels(theme: 'blood' | 'arcane', progress: number, time: number, index: number): Px[] {
  const pal = G.palettes[theme];
  const pattern = theme === 'blood' ? G.drop : G.orb;
  const h = pattern.length;
  const rows = filledRows(h, progress);
  const ready = progress >= 1;
  // Odblask: kropla — stały, kula — wędruje po obwodzie.
  const glint = theme === 'blood' ? { x: 2, y: 4 } : [{ x: 2, y: 2 }, { x: 3, y: 1 }, { x: 4, y: 2 }][Math.floor(time / 300 + index) % 3];
  const out: Px[] = [];
  pattern.forEach((row, py) => {
    [...row].forEach((cell, px) => {
      if (cell !== '#') return;
      const fromBottom = h - 1 - py;
      const filled = fromBottom < rows;
      let color: number = pal.dark;
      if (filled) color = ready ? (fromBottom >= h - 3 ? pal.bright : fromBottom <= 1 ? pal.deep : pal.base) : pal.deep;
      if (filled && !ready && fromBottom === rows - 1) color = pal.base;
      if (ready && glint && px === glint.x && py === glint.y) color = pal.glint;
      out.push({ x: px, y: py, color });
    });
  });
  return out;
}

/** Łuk: ramię z owijką, cięciwa naciągnięta według postępu; gotowy ładunek — pełny naciąg ze strzałą. */
function bowPixels(progress: number): Px[] {
  const pal = G.palettes.bowstring;
  const B = G.bow;
  const ready = progress >= 1;
  const pull = bowPull(progress);
  const out: Px[] = [];
  const has = (x: number, y: number) => out.some((p) => p.x === x && p.y === y);
  B.limb.forEach(([lx, ly]) => out.push({ x: lx, y: ly, color: ly <= 1 || ly >= B.height - 2 ? pal.bright : ly < B.nockY ? pal.base : pal.deep }));
  B.grip.forEach(([gx, gy]) => out.push({ x: gx, y: gy, color: pal.deep }));
  const [topX, topY] = B.limb[0] ?? [0, 0];
  const [bottomX, bottomY] = B.limb[B.limb.length - 1] ?? [0, 0];
  const nock = { x: topX + pull, y: B.nockY };
  const stringColor = ready ? pal.bright : progress > 0 ? pal.base : pal.deep;
  for (const c of [...pixelLine(topX, topY, nock.x, nock.y), ...pixelLine(nock.x, nock.y, bottomX, bottomY)]) {
    if (!has(c.x, c.y)) out.push({ x: c.x, y: c.y, color: stringColor });
  }
  if (ready) {
    // Strzała na cięciwie: grot wystaje za łuk w lewo, lotki w zieleni łucznika przy cięciwie.
    for (let ax = 0; ax < nock.x; ax++) if (!has(ax, B.nockY)) out.push({ x: ax, y: B.nockY, color: ax <= 1 ? pal.glint : pal.bright });
    out.push({ x: 1, y: B.nockY - 1, color: pal.bright }, { x: 1, y: B.nockY + 1, color: pal.bright });
    out.push({ x: nock.x - 2, y: B.nockY - 1, color: pal.glint }, { x: nock.x - 2, y: B.nockY + 1, color: pal.glint });
  }
  return out;
}
