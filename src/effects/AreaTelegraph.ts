import type Phaser from 'phaser';
import type { AreaStrike } from '@/core/bossTypes';
import { AREA_TELEGRAPH_VISUAL, SMOKE_VISUAL } from '@/config/spriteConfig';
import { FIRE_FX } from '@/config/fireConfig';
import { SLUDGE_FX } from '@/config/sludgeConfig';
import { exposedArcs } from '@/systems/AreaOutline';
import { closingRingRadius } from '@/systems/FireBurst';
import type { OutlineCircle } from '@/systems/AreaOutline';

/** To, czego telegraf potrzebuje ze strefy (bomby i wybuchy elit nie są `AreaStrike`, ale rysują się tak samo). */
export type TelegraphZone = Pick<AreaStrike, 'center' | 'radius' | 'telegraphStartAt' | 'impactAt'> & {
  readonly look?: AreaStrike['look'];
  /** Inny kolor strefy niż czerwień (np. pomarańcz wybuchu Wybuchowej elity). */
  readonly tint?: number;
};

/**
 * Telegraf strefy obrażeń (krok 110: wspólny dla bossów, pajączków, kokonów, palenisk, bomb i wybuchów elit).
 * Czerwony brzeg leży w środku strefy, ciemny obrys tuż za nim — ich styk to dokładny zasięg trafienia.
 * `group` — inne strefy tego samego ataku (hak, smuga): obrys rysujemy tylko na zewnętrznym brzegu sumy kół.
 * Nie czyści `gfx` (kilka stref może dzielić jedną grafikę) — robi to wywołujący.
 */
export function drawZoneTelegraph(gfx: Phaser.GameObjects.Graphics, zone: TelegraphZone, now: number, group: readonly OutlineCircle[] = []): void {
  if (now < zone.telegraphStartAt) return;
  const v = AREA_TELEGRAPH_VISUAL;
  const span = Math.max(1, zone.impactAt - zone.telegraphStartAt);
  const progress = Math.min(1, Math.max(0, (now - zone.telegraphStartAt) / span));
  // Smuga dymu Barona (krok 83) ma szary telegraf; reszta — czerwony.
  const smoke = zone.look === 'smoke';
  // Król Szlamu (krok 152): fioletowy telegraf szlamu zamiast czerwieni.
  const sludge = zone.look === 'sludge' ? SLUDGE_FX.telegraph : null;
  const color = smoke ? SMOKE_VISUAL.telegraph.color : sludge ? sludge.color : (zone.tint ?? v.color);
  const remaining = zone.impactAt - now;
  const blink = remaining <= v.warnMs && Math.floor(remaining / v.warnBlinkMs) % 2 === 0;
  const edge = blink ? v.warnColor : smoke ? SMOKE_VISUAL.telegraph.edge : sludge ? sludge.edge : color;
  const { x, y } = { x: Math.round(zone.center.x), y: Math.round(zone.center.y) };
  const r = Math.round(zone.radius);

  gfx.fillStyle(color, smoke ? 0.14 : (sludge?.fillAlpha ?? v.fillAlpha)).fillCircle(x, y, r);
  gfx.fillStyle(color, smoke ? SMOKE_VISUAL.telegraph.fillAlpha : (sludge?.progressAlpha ?? v.progressAlpha)).fillCircle(x, y, r * progress);

  const arcs = group.length > 1 ? exposedArcs(zone, group, v.outlineSegments) : [{ start: 0, end: Math.PI * 2 }];
  // Pierścień zaciska się na brzeg i dotyka go w chwili uderzenia (krok 144) — widać, ile zostało czasu.
  const closing = smoke ? null : closingRingRadius(r, progress, FIRE_FX.closing.startScale, FIRE_FX.closing.fromProgress);
  if (closing !== null && closing > r + 1) {
    const c = FIRE_FX.closing;
    gfx.lineStyle(c.width, sludge?.closing ?? c.color, c.alpha * Math.min(1, progress * 1.5));
    for (const arc of arcs) gfx.beginPath().arc(x, y, Math.round(closing), arc.start, arc.end).strokePath();
  }
  for (const arc of arcs) {
    // Obrys na zewnątrz (r..r+2), brzeg w środku (r-2..r).
    gfx.lineStyle(2, v.outline, v.outlineAlpha).beginPath().arc(x, y, r + 1, arc.start, arc.end).strokePath();
    gfx.lineStyle(2, edge, smoke && !blink ? SMOKE_VISUAL.telegraph.edgeAlpha : v.edgeAlpha).beginPath().arc(x, y, r - 1, arc.start, arc.end).strokePath();
  }
}

/** Telegraf jednej strefy na własnej grafice (czyści ją co klatkę). */
export function drawAreaTelegraph(gfx: Phaser.GameObjects.Graphics, zone: TelegraphZone, now: number, group: readonly OutlineCircle[] = []): void {
  gfx.clear();
  drawZoneTelegraph(gfx, zone, now, group);
}
