import type Phaser from 'phaser';
import { HUD_GAUGES, type GaugePalette, type GaugeTheme } from '@/config/hudGaugeConfig';
import { UI_PALETTE } from '@/config/uiConfig';
import type { BeamHudData } from '@/core/types';
import { flowStart, heartbeatLevel, sparklePositions, stringSag } from '@/systems/hudGauges';

/**
 * Żywe wskaźniki bohatera pod paskiem zdrowia (krok U7e): dash i promień rysowane w motywie klasy
 * (`config/hudGaugeConfig.ts`). Ruch liczy `systems/hudGauges.ts`, tu tylko piksele.
 */

const G = HUD_GAUGES;
const INK = UI_PALETTE.ink;

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
