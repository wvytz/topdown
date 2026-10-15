import Phaser from 'phaser';
import type { DeathSummary } from '@/core/types';
import type { RankedEntry } from '@/systems/Highscores';
import {
  DEATH_BLOOD_COLORS,
  DEATH_DRIPS,
  DEATH_LAYOUT as L,
  DEATH_PALETTE as P,
  DEATH_PARTICLES as FX,
  DEATH_SPLAT,
  DEATH_TIMING,
  DEATH_TITLE_BANDS,
} from '@/config/deathScreenConfig';
import { pixelText } from '@/core/pixelArt';
import { createRng } from '@/core/random';
import type { Drip, Particle } from '@/systems/deathScreen';
import { deathFrame, deathImpactAt, dripLength, dropsReleased, planDrips, planSplat, stepParticle } from '@/systems/deathScreen';

const VIGNETTE_TEXTURE = 'death-vignette';
const SPLAT_TEXTURE = 'death-splat';
/** Wiersze tablicy: podium (3) + separator + wiersz bieżącego runu. */
const ROWS = 5;

interface LiveParticle {
  readonly rect: Phaser.GameObjects.Rectangle;
  p: Particle;
  age: number;
  readonly life: number;
}

function formatScoreRow(row: RankedEntry): string {
  const label = `${row.rank}. ${row.entry.score} złota · piętro ${row.entry.floor}`;
  return row.isCurrent ? `► ${label} ◄` : label;
}

/**
 * Ekran śmierci (krok 35; od kroku 39 „krwawy”) w scenie HUD: mocno przyciemnia grę (wrogowie dalej
 * ruszają się pod spodem), POLEGŁEŚ uderza na rozpryskującą się plamę krwi i ocieka krwią,
 * a na środku jest wynik i tablica rekordów.
 * Decyzje (czasy, plan strug i plamy) liczy `systems/deathScreen`; tu tylko rysujemy.
 */
export class DeathScreen {
  private readonly root: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly vignette: Phaser.GameObjects.Image;
  private readonly splat: Phaser.GameObjects.Image;
  private readonly band: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Container;
  private readonly dripGraphics: Phaser.GameObjects.Graphics;
  private readonly flash: Phaser.GameObjects.Rectangle;
  private readonly score: Phaser.GameObjects.Text;
  private readonly ornament: Phaser.GameObjects.Container;
  private readonly header: Phaser.GameObjects.Text;
  private readonly rows: Phaser.GameObjects.Text[];
  private readonly prompt: Phaser.GameObjects.Text;

  private readonly unit: number;
  private readonly originX: number;
  private readonly originY: number;
  private readonly drips: Drip[];
  private dropCounts: number[];
  private particles: LiveParticle[] = [];
  private startedAt: number | null = null;
  private impactDone = false;
  private shownFor: DeathSummary | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      color: '#e8e8f0',
      stroke: '#000000',
      strokeThickness: 4,
    };

    this.dim = scene.add.rectangle(0, 0, width, height, P.void).setOrigin(0);
    this.vignette = scene.add.image(width / 2, height / 2, this.vignetteTexture(width, height));
    this.splat = scene.add.image(L.centerX, L.title.centerY, this.splatTexture());
    this.band = scene.add.rectangle(L.centerX, L.band.y + L.band.height / 2, L.band.width, L.band.height, P.void);

    // Napis: wytłoczenie w ciemną krew, obrys i lico w pasach czerwieni.
    const { unit, gap, extrude: e } = L.title;
    const text = pixelText('POLEGŁEŚ', gap);
    this.unit = unit;
    this.originX = (-text.width * unit) / 2;
    this.originY = (-(text.height - text.top) * unit) / 2 - text.top * unit;
    const g = scene.add.graphics();
    const layer = (dx: number, dy: number, color: number): void => {
      g.fillStyle(color);
      for (const { x, y } of text.cells) g.fillRect(this.originX + x * unit + dx, this.originY + y * unit + dy, unit, unit);
    };
    layer(0, 4 * e, P.void);
    layer(0, 3 * e, P.blood0);
    layer(0, 2 * e, P.blood1);
    for (const [dx, dy] of [[-e, 0], [e, 0], [0, -e], [-e, e], [e, e]] as const) layer(dx, dy, P.outline);
    layer(0, e, P.blood0);
    for (const { x, y } of text.cells) {
      g.fillStyle(DEATH_TITLE_BANDS[Math.max(0, y)] ?? P.eye0).fillRect(this.originX + x * unit, this.originY + y * unit, unit, unit);
    }
    // Strugi rysujemy w tym samym kontenerze — skalują się razem z napisem.
    this.dripGraphics = scene.add.graphics();
    this.title = scene.add.container(L.centerX, L.title.centerY, [this.dripGraphics, g]);
    this.drips = planDrips(text.cells, createRng(DEATH_DRIPS.salt));
    this.dropCounts = this.drips.map(() => 0);

    this.flash = scene.add.rectangle(0, 0, width, height, P.eye1).setOrigin(0);
    this.score = scene.add
      .text(L.centerX, L.score.y, '', { ...style, fontSize: `${L.score.fontSize}px`, color: '#e7b140' })
      .setOrigin(0.5, 0);
    this.ornament = this.buildOrnament();
    this.header = scene.add
      .text(L.centerX, L.header.y, 'NAJLEPSZE WSPINACZKI', { ...style, fontSize: `${L.header.fontSize}px`, color: '#9c8f74' })
      .setOrigin(0.5, 0)
      .setLetterSpacing(3);
    this.rows = Array.from({ length: ROWS }, (_, i) =>
      scene.add.text(L.centerX, L.rows.y + i * L.rows.step, '', { ...style, fontSize: `${L.rows.fontSize}px` }).setOrigin(0.5, 0),
    );
    this.prompt = scene.add
      .text(L.centerX, L.prompt.y, 'R — NOWA WSPINACZKA', { ...style, fontSize: `${L.prompt.fontSize}px`, color: '#f1e2a9' })
      .setOrigin(0.5, 0)
      .setLetterSpacing(4);

    this.root = scene.add.container(0, 0, [
      this.dim,
      this.vignette,
      this.splat,
      this.band,
      this.title,
      this.flash,
      this.score,
      this.ornament,
      this.header,
      ...this.rows,
      this.prompt,
    ]);
    this.root.setVisible(false);
  }

  /** Co klatkę z HUD: `death` = null chowa ekran (np. po restarcie runu). */
  update(death: DeathSummary | null, now: number, deltaMs: number): void {
    if (!death) {
      if (this.shownFor) this.reset();
      return;
    }
    if (this.shownFor !== death) this.start(death, now);
    const t = now - (this.startedAt ?? now);
    const f = deathFrame(t);

    this.dim.setAlpha(f.dimAlpha);
    this.vignette.setAlpha(f.dimAlpha / DEATH_TIMING.dimAlpha);
    this.splat.setVisible(f.splatScale > 0).setScale(f.splatScale);
    this.band.setAlpha(L.band.alpha * f.scoreAlpha);
    this.title.setVisible(f.titleVisible).setScale(f.titleScale);
    this.flash.setAlpha(f.flashAlpha);
    this.score.setAlpha(f.scoreAlpha);
    this.ornament.setAlpha(f.scoreAlpha);
    this.header.setAlpha(f.scoreAlpha);
    this.rows.forEach((row, i) => row.setAlpha(i < f.rowsVisible ? 1 : 0));
    this.prompt.setVisible(f.promptVisible);

    if (!this.impactDone && t >= deathImpactAt()) {
      this.impactDone = true;
      this.scene.cameras.main.shake(DEATH_TIMING.shakeDuration, DEATH_TIMING.shakeIntensity);
      this.burst();
    }
    this.drawDrips(t);
    this.updateParticles(deltaMs);
  }

  private start(death: DeathSummary, now: number): void {
    this.reset();
    this.shownFor = death;
    this.startedAt = now;
    this.root.setVisible(true);

    this.score.setText(`WYNIK: ${death.score} ZŁOTA · PIĘTRO ${death.floor} · MIEJSCE ${death.rank}`);
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
      row.setText(line?.text ?? '').setColor(line?.current ? '#f1e2a9' : '#d8ccb0');
    });
  }

  private reset(): void {
    this.shownFor = null;
    this.startedAt = null;
    this.impactDone = false;
    this.dropCounts = this.drips.map(() => 0);
    this.dripGraphics.clear();
    for (const particle of this.particles) particle.rect.destroy();
    this.particles = [];
    this.root.setVisible(false);
  }

  // ——— krew ———

  /** Strugi ciekną z dolnych krawędzi liter; pełna struga co jakiś czas gubi kroplę z czubka. */
  private drawDrips(t: number): void {
    const g = this.dripGraphics.clear();
    const { width, tipWidth, tipHeight } = L.drip;
    this.drips.forEach((drip, i) => {
      const length = dripLength(drip, t);
      if (length <= 0) return;
      const cx = this.originX + (drip.cell.x + 0.5) * this.unit;
      const top = this.originY + (drip.cell.y + 1) * this.unit;
      // Struga: lewa połowa jaśniejsza (światło z lewej); u nasady szersza (krew wypływa spod litery).
      g.fillStyle(P.blood2).fillRect(cx - width / 2, top, width, length);
      g.fillStyle(P.eye0).fillRect(cx - width / 2, top, width / 2, length);
      g.fillStyle(P.eye0).fillRect(cx - width, top, width * 2, Math.min(4, length));
      // Kropla na czubku.
      const tipY = top + length - tipHeight / 2;
      g.fillStyle(P.eye0).fillRect(cx - tipWidth / 2, tipY, tipWidth, tipHeight);
      g.fillStyle(P.eye1).fillRect(cx - tipWidth / 2 + 1, tipY + 1, 2, 2);

      const released = dropsReleased(drip, t);
      if (released > (this.dropCounts[i] ?? 0)) {
        this.dropCounts[i] = released;
        // Kropla odrywa się od czubka (pozycja na ekranie, napis ma już skalę 1).
        const x = L.centerX + cx - tipWidth / 2;
        const y = L.title.centerY + tipY + tipHeight;
        this.spawn(x, y, 4, P.eye0, { x, y, vx: 0, vy: 0.02 }, FX.dropLifeMs);
      }
    });
  }

  private burst(): void {
    const halfWidth = -this.originX;
    for (let i = 0; i < FX.burstCount; i++) {
      // Losowość czysto wizualna.
      const x = L.centerX + (Math.random() * 2 - 1) * halfWidth;
      const y = L.title.centerY + (Math.random() - 0.3) * 30;
      const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * 1.3;
      const speed = FX.burstSpeedMin + Math.random() * (FX.burstSpeedMax - FX.burstSpeedMin);
      const size = Math.random() < 0.6 ? 3 : 5;
      const color = DEATH_BLOOD_COLORS[Math.floor(Math.random() * DEATH_BLOOD_COLORS.length)] ?? P.eye0;
      this.spawn(x, y, size, color, {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      }, FX.burstLifeMs * (0.6 + Math.random() * 0.6));
    }
  }

  private spawn(x: number, y: number, size: number, color: number, p: Particle, life: number): void {
    const rect = this.scene.add.rectangle(x, y, size, size, color).setOrigin(0);
    // Nad napisem, pod tekstem tablicy.
    this.root.addAt(rect, this.root.getIndex(this.flash));
    this.particles.push({ rect, p, age: 0, life });
  }

  private updateParticles(deltaMs: number): void {
    const height = this.scene.scale.height;
    this.particles = this.particles.filter((particle) => {
      particle.age += deltaMs;
      particle.p = stepParticle(particle.p, deltaMs, FX.gravity);
      const alpha = 1 - particle.age / particle.life;
      if (alpha <= 0 || particle.p.y > height) {
        particle.rect.destroy();
        return false;
      }
      // Pozycja na całe piksele — bez rozmycia.
      particle.rect.setPosition(Math.round(particle.p.x), Math.round(particle.p.y)).setAlpha(Math.min(1, alpha * 1.5));
      return true;
    });
  }

  // ——— dekoracje i tekstury ———

  private buildOrnament(): Phaser.GameObjects.Container {
    const { width, gap } = L.ornament;
    const parts = [-1, 1].flatMap((side) => [
      this.scene.add.rectangle(side * gap, 0, 8, 8, P.eye0).setAngle(45),
      this.scene.add.rectangle(side * (gap + 8 + width / 2), 0, width, 4, P.blood1),
    ]);
    parts.push(this.scene.add.rectangle(0, 0, 4, 4, P.eye1));
    return this.scene.add.container(L.centerX, L.ornament.y, parts);
  }

  /** Plama krwi z planu (deterministyczna), narysowana raz do tekstury; brzeg ciemniejszy, w środku połysk. */
  private splatTexture(): string {
    const textures = this.scene.textures;
    if (textures.exists(SPLAT_TEXTURE)) return SPLAT_TEXTURE;
    const cells = planSplat(createRng(DEATH_SPLAT.salt));
    const c = DEATH_SPLAT.cell;
    const minX = Math.min(...cells.map((p) => p.x));
    const maxX = Math.max(...cells.map((p) => p.x));
    const minY = Math.min(...cells.map((p) => p.y));
    const maxY = Math.max(...cells.map((p) => p.y));
    // Środek plamy (0, 0) w środku tekstury — symetryczne wymiary.
    const halfW = Math.max(-minX, maxX) + 1;
    const halfH = Math.max(-minY, maxY) + 1;
    const canvas = textures.createCanvas(SPLAT_TEXTURE, halfW * 2 * c, halfH * 2 * c);
    const ctx = canvas?.getContext();
    if (!canvas || !ctx) return SPLAT_TEXTURE;
    const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
    const colors = { edge: hex(P.blood0), inner: hex(P.blood1), sheen: hex(P.blood2) };
    for (const { x, y, tone } of cells) {
      ctx.fillStyle = colors[tone];
      ctx.fillRect((x + halfW) * c, (y + halfH) * c, c, c);
    }
    canvas.refresh();
    return SPLAT_TEXTURE;
  }

  /** Winieta: krawędzie ekranu w zakrzepłej krwi, środek ciemny — gra ledwo prześwituje. */
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
    grad.addColorStop(0.35, 'rgba(62, 15, 20, 0)');
    grad.addColorStop(1, `rgba(62, 15, 20, ${L.vignetteAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
    ctx.restore();
    canvas.refresh();
    return VIGNETTE_TEXTURE;
  }
}
