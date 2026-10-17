import Phaser from 'phaser';
import type { DeathSummary } from '@/core/types';
import type { RankedEntry } from '@/systems/Highscores';
import { DEATH_LAYOUT as L, DEATH_PALETTE as P, DEATH_TITLE_FLOW as FLOW } from '@/config/deathScreenConfig';
import { GLYPH_WIDTH, pixelText } from '@/core/pixelArt';
import type { PixelText } from '@/core/pixelArt';
import { deathFrame, flowGroupOf, titleFlowIndex } from '@/systems/deathScreen';

const VIGNETTE_TEXTURE = 'death-vignette';
const BAND_TEXTURE = 'death-band';
const GLOW_TEXTURE = 'death-glow';
/** Wiersze tablicy: podium (3) + separator + wiersz bieżącego runu. */
const ROWS = 5;

/** Nagłówek tablicy zależnie od źródła wyników (wspólna lista z main, krok 36 tam). */
const HEADERS: Record<DeathSummary['source'], string> = {
  local: 'NAJLEPSZE WSPINACZKI',
  pending: 'NAJLEPSZE WSPINACZKI · ŁĄCZENIE…',
  shared: 'NAJLEPSZE WSPINACZKI · WSZYSCY GRACZE',
  practice: 'RUN TESTOWY — WYNIK NIE TRAFIA NA TABLICĘ',
};

function formatScoreRow(row: RankedEntry): string {
  const label = `${row.rank}. ${row.entry.name ?? '—'} · ${row.entry.score} złota · piętro ${row.entry.floor}`;
  return row.isCurrent ? `› ${label} ‹` : label;
}

/**
 * Ekran śmierci (krok 35; od kroku 63 w stylu Dark Souls / Castlevanii) w scenie HUD:
 * gra powoli tonie w ciemności (wrogowie dalej ruszają się pod spodem), przez środek ekranu czarny pas,
 * na nim POLEGŁEŚ w przygaszonej czerwieni — wyłania się powoli i bardzo wolno rośnie.
 * Pod spodem wynik i tablica rekordów. Czasy liczy `systems/deathScreen`; tu tylko rysujemy.
 */
export class DeathScreen {
  private readonly root: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly vignette: Phaser.GameObjects.Image;
  private readonly band: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly title: Phaser.GameObjects.Container;
  /** Lico liter — przerysowywane co klatkę (spływająca czerwień). */
  private readonly titleFill: Phaser.GameObjects.Graphics;
  private readonly titleText: PixelText;
  private readonly titleLeft: number;
  private readonly titleTop: number;
  private readonly score: Phaser.GameObjects.Text;
  private readonly ornament: Phaser.GameObjects.Container;
  private readonly header: Phaser.GameObjects.Text;
  private readonly rows: Phaser.GameObjects.Text[];
  private readonly prompt: Phaser.GameObjects.Text;
  private startedAt: number | null = null;
  private shownFor: DeathSummary | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      color: '#d8ccb0',
      stroke: '#07060b',
      strokeThickness: 3,
    };

    this.dim = scene.add.rectangle(0, 0, width, height, P.void).setOrigin(0);
    this.vignette = scene.add.image(width / 2, height / 2, this.vignetteTexture(width, height));
    this.band = scene.add.image(width / 2, L.band.top, this.bandTexture(width)).setOrigin(0.5, 0);
    this.glow = scene.add.image(L.centerX, L.title.centerY, this.glowTexture());
    const { unit, gap } = L.title;
    this.titleText = pixelText('POLEGŁEŚ', gap);
    this.titleLeft = (-this.titleText.width * unit) / 2;
    this.titleTop = (-(this.titleText.height - this.titleText.top) * unit) / 2 - this.titleText.top * unit;
    this.titleFill = scene.add.graphics();
    this.title = this.buildTitle();

    this.score = scene.add
      .text(L.centerX, L.score.y, '', { ...style, fontSize: `${L.score.fontSize}px`, color: '#9c8f74' })
      .setOrigin(0.5, 0)
      .setLetterSpacing(2);
    this.ornament = this.buildOrnament();
    this.header = scene.add
      .text(L.centerX, L.header.y, 'NAJLEPSZE WSPINACZKI', { ...style, fontSize: `${L.header.fontSize}px`, color: '#573e38' })
      .setOrigin(0.5, 0)
      .setLetterSpacing(4);
    this.rows = Array.from({ length: ROWS }, (_, i) =>
      scene.add.text(L.centerX, L.rows.y + i * L.rows.step, '', { ...style, fontSize: `${L.rows.fontSize}px` }).setOrigin(0.5, 0),
    );
    this.prompt = scene.add
      .text(L.centerX, L.prompt.y, 'R — NOWA WSPINACZKA · C — ZMIANA BOHATERA', { ...style, fontSize: `${L.prompt.fontSize}px`, color: '#9c8f74' })
      .setOrigin(0.5, 0)
      .setLetterSpacing(5);

    this.root = scene.add.container(0, 0, [
      this.dim,
      this.vignette,
      this.band,
      this.glow,
      this.title,
      this.score,
      this.ornament,
      this.header,
      ...this.rows,
      this.prompt,
    ]);
    this.root.setVisible(false);
  }

  /**
   * Co klatkę z HUD: `death` = null chowa ekran (np. po restarcie runu).
   * Ta sama śmierć może przyjść jako nowy obiekt (wpisywanie imienia, wspólna tablica) —
   * wtedy odświeżamy tylko tekst, animacja biegnie dalej.
   */
  update(death: DeathSummary | null, now: number): void {
    if (!death) {
      if (this.shownFor) this.reset();
      return;
    }
    if (!this.shownFor) this.start(death, now);
    else if (this.shownFor !== death) this.fill(death);
    const f = deathFrame(now - (this.startedAt ?? now), ROWS);

    this.dim.setAlpha(f.dimAlpha);
    this.vignette.setAlpha(f.bandAlpha);
    this.band.setAlpha(f.bandAlpha * L.band.alpha);
    this.title.setAlpha(f.titleAlpha).setScale(f.titleScale);
    this.drawTitleFill(now - (this.startedAt ?? now));
    this.glow.setAlpha(f.titleAlpha).setScale(f.titleScale);
    this.score.setAlpha(f.scoreAlpha);
    this.ornament.setAlpha(f.scoreAlpha);
    this.header.setAlpha(f.scoreAlpha);
    this.rows.forEach((row, i) => row.setAlpha(f.rowAlphas[i] ?? 0));
    // Podczas wpisywania imienia komunikat o nowej wspinaczce jest ukryty (R i C wpisują litery).
    this.prompt.setAlpha(this.shownFor?.nameEntry === null ? f.promptAlpha : 0);
  }

  private start(death: DeathSummary, now: number): void {
    this.startedAt = now;
    this.root.setVisible(true);
    this.fill(death);
  }

  /** Wynik i tablica albo pole na imię (pierwsza śmierć bez zapamiętanego imienia). */
  private fill(death: DeathSummary): void {
    this.shownFor = death;
    const place = death.nameEntry === null && death.source !== 'practice' ? ` · MIEJSCE ${death.rank}` : '';
    this.score.setText(`${death.score} ZŁOTA · PIĘTRO ${death.floor}${place}`);
    if (death.nameEntry !== null) {
      this.header.setText('TWOJE IMIĘ NA TABLICY WYNIKÓW');
      const entry = [
        { text: `${death.nameEntry}_`, color: '#d8ccb0' },
        { text: 'ENTER — ZAPISZ · ESC — BEZ IMIENIA', color: '#9c8f74' },
      ];
      this.rows.forEach((row, i) => row.setText(entry[i]?.text ?? '').setColor(entry[i]?.color ?? '#9c8f74'));
      return;
    }
    this.header.setText(HEADERS[death.source]);
    const lines: Array<{ text: string; current: boolean }> = death.board.top.map((row) => ({
      text: formatScoreRow(row),
      current: row.isCurrent,
    }));
    if (death.board.current) {
      lines.push({ text: '· · ·', current: false });
      lines.push({ text: formatScoreRow(death.board.current), current: true });
    }
    this.rows.forEach((row, i) => {
      const line = lines[i];
      row.setText(line?.text ?? '').setColor(line?.current ? '#d8ccb0' : '#9c8f74');
    });
  }

  private reset(): void {
    this.shownFor = null;
    this.startedAt = null;
    this.root.setVisible(false);
  }

  /** POLEGŁEŚ: cienki obrys w czerni i płytki cień (nieruchome) + lico ze spływającą czerwienią. */
  private buildTitle(): Phaser.GameObjects.Container {
    const { unit, outline: o } = L.title;
    const g = this.scene.add.graphics();
    const layer = (dx: number, dy: number, color: number): void => {
      g.fillStyle(color);
      for (const { x, y } of this.titleText.cells) {
        g.fillRect(this.titleLeft + x * unit + dx, this.titleTop + y * unit + dy, unit, unit);
      }
    };
    layer(0, 2 * o, P.blood0);
    for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]] as const) layer(dx, dy, P.void);
    return this.scene.add.container(L.centerX, L.title.centerY, [g, this.titleFill]);
  }

  /** Lico liter paskami po `stripPx`: kolor z rampy przesuwającej się w dół (`titleFlowIndex`), osobno dla grup liter. */
  private drawTitleFill(t: number): void {
    const { unit } = L.title;
    const strip = FLOW.stripPx;
    const top = this.titleText.top * unit;
    const g = this.titleFill.clear();
    for (const { x, y } of this.titleText.cells) {
      // Każda grupa liter (PO | LEG | ŁEŚ) spływa we własnym tempie.
      const group = flowGroupOf(Math.floor(x / (GLYPH_WIDTH + L.title.gap)));
      for (let dy = 0; dy < unit; dy += strip) {
        const py = y * unit + dy;
        g.fillStyle(FLOW.ramp[titleFlowIndex(py - top, t, FLOW, group.speedPxPerSec, group.offsetPx)] ?? P.eye0);
        g.fillRect(this.titleLeft + x * unit, this.titleTop + py, unit, strip);
      }
    }
  }

  /** Gotycki ozdobnik: cienkie linie i mały krzyż pośrodku. */
  private buildOrnament(): Phaser.GameObjects.Container {
    const { width, gap } = L.ornament;
    const parts = [-1, 1].map((side) => this.scene.add.rectangle(side * (gap + width / 2), 0, width, 2, P.blood1));
    parts.push(this.scene.add.rectangle(0, 0, 2, 12, P.blood2), this.scene.add.rectangle(0, -2, 8, 2, P.blood2));
    return this.scene.add.container(L.centerX, L.ornament.y, parts);
  }

  /** Pas przez ekran: pełna czerń od dołu HUD-u w stronę tablicy, krótkie rozmycie u góry, dłuższe u dołu. */
  private bandTexture(width: number): string {
    const textures = this.scene.textures;
    if (textures.exists(BAND_TEXTURE)) return BAND_TEXTURE;
    const { top, bottom, fadeTopPx, fadeBottomPx } = L.band;
    const h = bottom - top;
    const canvas = textures.createCanvas(BAND_TEXTURE, width, h);
    const ctx = canvas?.getContext();
    if (!canvas || !ctx) return BAND_TEXTURE;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(7, 6, 11, 0)');
    grad.addColorStop(fadeTopPx / h, 'rgba(7, 6, 11, 1)');
    grad.addColorStop(1 - fadeBottomPx / h, 'rgba(7, 6, 11, 1)');
    grad.addColorStop(1, 'rgba(7, 6, 11, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, h);
    canvas.refresh();
    return BAND_TEXTURE;
  }

  /** Ledwo widoczna ciemnoczerwona poświata za napisem. */
  private glowTexture(): string {
    const textures = this.scene.textures;
    if (textures.exists(GLOW_TEXTURE)) return GLOW_TEXTURE;
    const { width, height, alpha } = L.glow;
    const canvas = textures.createCanvas(GLOW_TEXTURE, width, height);
    const ctx = canvas?.getContext();
    if (!canvas || !ctx) return GLOW_TEXTURE;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(1, height / width);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, width / 2);
    grad.addColorStop(0, `rgba(110, 26, 31, ${alpha})`);
    grad.addColorStop(1, 'rgba(110, 26, 31, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-width / 2, -width / 2, width, width);
    ctx.restore();
    canvas.refresh();
    return GLOW_TEXTURE;
  }

  /** Winieta: krawędzie ekranu w czerni. */
  private vignetteTexture(width: number, height: number): string {
    const textures = this.scene.textures;
    if (textures.exists(VIGNETTE_TEXTURE)) return VIGNETTE_TEXTURE;
    const canvas = textures.createCanvas(VIGNETTE_TEXTURE, width, height);
    const ctx = canvas?.getContext();
    if (!canvas || !ctx) return VIGNETTE_TEXTURE;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(1, height / width);
    const r = width * 0.7;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0.4, 'rgba(7, 6, 11, 0)');
    grad.addColorStop(1, `rgba(7, 6, 11, ${L.vignetteAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
    ctx.restore();
    canvas.refresh();
    return VIGNETTE_TEXTURE;
  }
}
