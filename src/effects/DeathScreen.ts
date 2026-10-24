import Phaser from 'phaser';
import type { DeathSummary } from '@/core/types';
import { DEATH_HERO_ICON as ICON, DEATH_LAYOUT as L, DEATH_PALETTE as P, DEATH_TITLE_FLOW as FLOW } from '@/config/deathScreenConfig';
import { heroIconTexture } from '@/effects/heroIcon';
import type { HeroId } from '@/core/heroTypes';
import { HIGHSCORE_CONFIG } from '@/config/lootConfig';
import { BOSS_RUSH_TEXT } from '@/config/bossRushConfig';
import { SAVE_TEXT } from '@/config/saveConfig';
import { FLOOR_SELECT_TEXT } from '@/config/floorSelectConfig';
import { GLYPH_WIDTH, pixelText } from '@/core/pixelArt';
import type { PixelText } from '@/core/pixelArt';
import { deathFrame, flowGroupOf, formatScoreRow, knownHero, titleFlowIndex } from '@/systems/deathScreen';
import type { RankedEntry } from '@/systems/Highscores';

const VIGNETTE_TEXTURE = 'death-vignette';
const BAND_TEXTURE = 'death-band';
const GLOW_TEXTURE = 'death-glow';
const TOWER_PROMPT = 'R — NOWA WSPINACZKA · C — ZMIANA BOHATERA · M — MENU';
/** Wiersze tablicy: podium + separator + wiersz bieżącego runu. */
const ROWS = HIGHSCORE_CONFIG.podiumSize + 2;

/** Nagłówek tablicy zależnie od źródła wyników (wspólna lista z main, krok 36 tam). */
const HEADERS: Record<DeathSummary['source'], string> = {
  local: 'NAJLEPSZE WSPINACZKI',
  pending: 'NAJLEPSZE WSPINACZKI · ŁĄCZENIE…',
  shared: 'NAJLEPSZE WSPINACZKI · WSZYSCY GRACZE',
  practice: 'RUN TESTOWY — WYNIK NIE TRAFIA NA TABLICĘ',
  fromSave: SAVE_TEXT.deathHeader,
  floorSelect: FLOOR_SELECT_TEXT.deathHeader,
};

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
  /** Miniaturki bohatera po lewej stronie wierszy (krok 89a). */
  private readonly icons: Phaser.GameObjects.Image[];
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
    this.icons = this.rows.map((row) => scene.add.image(row.x, row.y, '__DEFAULT').setVisible(false));
    this.prompt = scene.add
      .text(L.centerX, L.prompt.y, TOWER_PROMPT, { ...style, fontSize: `${L.prompt.fontSize}px`, color: '#9c8f74' })
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
      ...this.icons,
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
    this.icons.forEach((icon, i) => icon.setAlpha(f.rowAlphas[i] ?? 0));
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
    const unranked = death.source === 'practice' || death.source === 'fromSave' || death.source === 'floorSelect';
    const place = death.nameEntry === null && !unranked ? ` · MIEJSCE ${death.rank}` : '';
    // Na tablicy aren (krok 91a) o miejscu decyduje arena, więc idzie pierwsza.
    const result = death.arenas ? `ARENA ${death.floor} · ${death.score} ZŁOTA` : `${death.score} ZŁOTA · PIĘTRO ${death.floor}`;
    this.score.setText(`${result}${place}`);
    this.prompt.setText(death.arenas ? BOSS_RUSH_TEXT.deathPrompt : death.source === 'floorSelect' ? FLOOR_SELECT_TEXT.deathPrompt : TOWER_PROMPT);
    if (death.nameEntry !== null) {
      this.header.setText('TWOJE IMIĘ NA TABLICY WYNIKÓW');
      const entry = [
        { text: `${death.nameEntry}_`, color: '#d8ccb0' },
        { text: 'ENTER — ZAPISZ · ESC — BEZ IMIENIA', color: '#9c8f74' },
      ];
      this.rows.forEach((row, i) => row.setText(entry[i]?.text ?? '').setColor(entry[i]?.color ?? '#9c8f74'));
      this.icons.forEach((icon) => icon.setVisible(false));
      return;
    }
    this.header.setText(this.headerFor(death));
    const lines: Array<{ text: string; current: boolean; hero: HeroId | null }> = death.board.top.map((row) => this.line(row));
    if (death.board.current) {
      lines.push({ text: '· · ·', current: false, hero: null });
      lines.push(this.line(death.board.current));
    }
    this.rows.forEach((row, i) => {
      const line = lines[i];
      row.setText(line?.text ?? '').setColor(line?.current ? '#d8ccb0' : '#9c8f74');
    });
    // Wiersze są wyśrodkowane — miniaturki w jednej kolumnie przed najszerszym z nich.
    const widest = Math.max(...this.rows.map((row) => (row.text === '' ? 0 : row.width)));
    const iconX = L.centerX - widest / 2 - ICON.gapPx - ICON.sizePx / 2;
    this.icons.forEach((icon, i) => {
      const hero = lines[i]?.hero ?? null;
      const row = this.rows[i];
      icon.setVisible(hero !== null);
      if (hero === null || !row) return;
      icon.setTexture(heroIconTexture(this.scene, hero, ICON)).setPosition(iconX, row.y + row.height / 2);
    });
  }

  /** Nagłówek tablicy: areny bossów (krok 91a) mają własne nagłówki dla wyników z listy. */
  private headerFor(death: DeathSummary): string {
    const source = death.source;
    if (death.arenas && (source === 'local' || source === 'pending' || source === 'shared')) return BOSS_RUSH_TEXT.boardHeaders[source];
    return HEADERS[source];
  }

  private line(row: RankedEntry): { text: string; current: boolean; hero: HeroId | null } {
    return { text: formatScoreRow(row, this.shownFor?.arenas === true), current: row.isCurrent, hero: knownHero(row.entry.hero) };
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
