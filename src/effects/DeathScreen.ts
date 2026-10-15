import Phaser from 'phaser';
import type { DeathSummary } from '@/core/types';
import type { RankedEntry } from '@/systems/Highscores';
import {
  DEATH_BLOOD_COLORS,
  DEATH_CRUMBLE,
  DEATH_LAYOUT as L,
  DEATH_PALETTE as P,
  DEATH_PARTICLES as FX,
  DEATH_TIMING,
  DEATH_TITLE_BANDS,
} from '@/config/deathScreenConfig';
import { pixelText } from '@/core/pixelArt';
import type { PixelCell } from '@/core/pixelArt';
import { createRng } from '@/core/random';
import type { DripSource, Particle } from '@/systems/deathScreen';
import { deathFrame, deathImpactAt, dripsReleased, planCrumble, planDrips, splitIntoBlocks, stepParticle } from '@/systems/deathScreen';

const VIGNETTE_TEXTURE = 'death-vignette';
/** Wiersze tablicy: podium (3) + separator + wiersz bieżącego runu. */
const ROWS = 5;
/** Blok „gnije” (ciemnieje) przez tyle ms, zanim odpadnie. */
const ROT_MS = 600;

enum BlockState {
  Whole,
  Rotting,
  Gone,
}

interface LiveParticle {
  readonly rect: Phaser.GameObjects.Rectangle;
  p: Particle;
  age: number;
  readonly life: number;
  /** Kropla z krawędzi litery najpierw nabrzmiewa w miejscu. */
  readonly swellMs: number;
}

/** Nagłówek tablicy zależnie od źródła wyników (wspólna lista, krok 36). */
const HEADERS: Record<DeathSummary['source'], string> = {
  local: 'NAJLEPSZE WSPINACZKI',
  pending: 'NAJLEPSZE WSPINACZKI · ŁĄCZENIE…',
  shared: 'NAJLEPSZE WSPINACZKI · WSZYSCY GRACZE',
};

function formatScoreRow(row: RankedEntry): string {
  const label = `${row.rank}. ${row.entry.name ?? '—'} · ${row.entry.score} złota · piętro ${row.entry.floor}`;
  return row.isCurrent ? `► ${label} ◄` : label;
}

/**
 * Ekran śmierci (krok 35) w scenie HUD: przyciemnia grę (wrogowie dalej się ruszają pod spodem),
 * POLEGŁEŚ uderza, kruszy się i krwawi, a na środku jest wynik i tablica rekordów.
 * Decyzje (czasy, plan rozkładu, krople) liczy `systems/deathScreen`; tu tylko rysujemy.
 */
export class DeathScreen {
  private readonly root: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly vignette: Phaser.GameObjects.Image;
  private readonly band: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Container;
  private readonly titleFill: Phaser.GameObjects.Graphics;
  private readonly flash: Phaser.GameObjects.Rectangle;
  private readonly score: Phaser.GameObjects.Text;
  private readonly ornament: Phaser.GameObjects.Container;
  private readonly header: Phaser.GameObjects.Text;
  private readonly rows: Phaser.GameObjects.Text[];
  private readonly prompt: Phaser.GameObjects.Text;

  private readonly blocks: PixelCell[];
  private readonly blockSize: number;
  private readonly originX: number;
  private readonly originY: number;
  private readonly fallAt: (number | null)[];
  private readonly drips: DripSource[];
  private states: BlockState[];
  private dripCounts: number[];
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

    this.dim = scene.add.rectangle(0, 0, width, height, P.chitin0).setOrigin(0);
    this.vignette = scene.add.image(width / 2, height / 2, this.vignetteTexture(width, height));
    this.band = scene.add.rectangle(L.centerX, L.band.y + L.band.height / 2, L.band.width, L.band.height, P.chitin0);

    // Napis: piksele fontu rozbite na bloki; obrys i wytłoczenie rysujemy raz (po odpadnięciu bloku
    // prześwituje ciemne wnętrze — wygląda jak wyżarta dziura), lico przerysowujemy przy zmianach.
    const { unit, gap, extrude: e } = L.title;
    const text = pixelText('POLEGŁEŚ', gap);
    const n = DEATH_CRUMBLE.blocksPerPixel;
    this.blockSize = unit / n;
    this.originX = (-text.width * unit) / 2;
    this.originY = (-(text.height - text.top) * unit) / 2 - text.top * unit;
    const back = scene.add.graphics();
    const layer = (dx: number, dy: number, color: number): void => {
      back.fillStyle(color);
      for (const { x, y } of text.cells) back.fillRect(this.originX + x * unit + dx, this.originY + y * unit + dy, unit, unit);
    };
    layer(0, 4 * e, P.chitin0);
    layer(0, 3 * e, P.chitin1);
    layer(0, 2 * e, P.chitin2);
    for (const [dx, dy] of [[-e, 0], [e, 0], [0, -e], [-e, e], [e, e]] as const) layer(dx, dy, P.outline);
    layer(0, e, P.blood0);
    layer(0, 0, P.blood0);
    this.titleFill = scene.add.graphics();
    this.title = scene.add.container(L.centerX, L.title.centerY, [back, this.titleFill]);

    this.blocks = splitIntoBlocks(text.cells, n);
    this.fallAt = planCrumble(this.blocks, createRng(DEATH_CRUMBLE.salt));
    this.drips = planDrips(this.blocks, createRng(DEATH_CRUMBLE.salt + 1));
    this.states = this.blocks.map(() => BlockState.Whole);
    this.dripCounts = this.drips.map(() => 0);

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

  /**
   * Co klatkę z HUD: `death` = null chowa ekran (np. po restarcie runu).
   * Ta sama śmierć może przyjść jako nowy obiekt (wpisywanie imienia, wspólna tablica) —
   * wtedy odświeżamy tylko tekst, animacja biegnie dalej.
   */
  update(death: DeathSummary | null, now: number, deltaMs: number): void {
    if (!death) {
      if (this.shownFor) this.reset();
      return;
    }
    if (!this.shownFor) this.start(death, now);
    else if (this.shownFor !== death) this.fill(death);
    const t = now - (this.startedAt ?? now);
    const f = deathFrame(t);

    this.dim.setAlpha(f.dimAlpha);
    this.vignette.setAlpha(f.dimAlpha / DEATH_TIMING.dimAlpha);
    this.band.setAlpha(L.band.alpha * f.scoreAlpha);
    this.title.setVisible(f.titleVisible).setScale(f.titleScale);
    this.flash.setAlpha(f.flashAlpha);
    this.score.setAlpha(f.scoreAlpha);
    this.ornament.setAlpha(f.scoreAlpha);
    this.header.setAlpha(f.scoreAlpha);
    this.rows.forEach((row, i) => row.setAlpha(i < f.rowsVisible ? 1 : 0));
    this.prompt.setVisible(f.promptVisible && this.shownFor?.nameEntry === null);

    if (!this.impactDone && t >= deathImpactAt()) {
      this.impactDone = true;
      this.scene.cameras.main.shake(DEATH_TIMING.shakeDuration, DEATH_TIMING.shakeIntensity);
      this.burst();
    }
    this.updateCrumble(t);
    this.updateDrips(t);
    this.updateParticles(deltaMs);
  }

  private start(death: DeathSummary, now: number): void {
    this.reset();
    this.shownFor = death;
    this.startedAt = now;
    this.root.setVisible(true);
    this.redrawFill();
    this.fill(death);
  }

  /** Wynik i tablica albo pole na imię (pierwsza śmierć bez zapamiętanego imienia). */
  private fill(death: DeathSummary): void {
    this.shownFor = death;
    const place = death.nameEntry === null ? ` · MIEJSCE ${death.rank}` : '';
    this.score.setText(`WYNIK: ${death.score} ZŁOTA · PIĘTRO ${death.floor}${place}`);
    if (death.nameEntry !== null) {
      this.header.setText('TWOJE IMIĘ NA TABLICY WYNIKÓW');
      const entry = [
        { text: `${death.nameEntry}_`, color: '#f1e2a9' },
        { text: 'ENTER — ZAPISZ · ESC — BEZ IMIENIA', color: '#9c8f74' },
      ];
      this.rows.forEach((row, i) => row.setText(entry[i]?.text ?? '').setColor(entry[i]?.color ?? '#d8ccb0'));
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
      row.setText(line?.text ?? '').setColor(line?.current ? '#f1e2a9' : '#d8ccb0');
    });
  }

  private reset(): void {
    this.shownFor = null;
    this.startedAt = null;
    this.impactDone = false;
    this.states = this.blocks.map(() => BlockState.Whole);
    this.dripCounts = this.drips.map(() => 0);
    for (const particle of this.particles) particle.rect.destroy();
    this.particles = [];
    this.root.setVisible(false);
  }

  // ——— rozkład napisu ———

  private updateCrumble(t: number): void {
    let changed = false;
    this.blocks.forEach((block, i) => {
      const at = this.fallAt[i];
      const state = at == null || t < at - ROT_MS ? BlockState.Whole : t < at ? BlockState.Rotting : BlockState.Gone;
      if (state === this.states[i]) return;
      this.states[i] = state;
      changed = true;
      if (state === BlockState.Gone) {
        const { x, y } = this.blockScreen(block);
        this.spawn(x, y, this.blockSize, P.blood0, {
          x,
          y,
          vx: (Math.random() * 2 - 1) * FX.shardDriftMax,
          vy: 0,
        }, FX.shardLifeMs, 0);
      }
    });
    if (changed) this.redrawFill();
  }

  private redrawFill(): void {
    const g = this.titleFill.clear();
    const n = DEATH_CRUMBLE.blocksPerPixel;
    this.blocks.forEach((block, i) => {
      const state = this.states[i];
      if (state === BlockState.Gone) return;
      const row = Math.max(0, Math.floor(block.y / n));
      const color = state === BlockState.Rotting ? P.blood1 : (DEATH_TITLE_BANDS[row] ?? P.eye0);
      g.fillStyle(color).fillRect(
        this.originX + block.x * this.blockSize,
        this.originY + block.y * this.blockSize,
        this.blockSize,
        this.blockSize,
      );
    });
  }

  /** Lewy górny róg bloku na ekranie (rozkład zaczyna się po ustaleniu skali napisu na 1). */
  private blockScreen(block: PixelCell): { x: number; y: number } {
    return {
      x: L.centerX + this.originX + block.x * this.blockSize,
      y: L.title.centerY + this.originY + block.y * this.blockSize,
    };
  }

  // ——— krew ———

  private burst(): void {
    const halfWidth = -this.originX;
    for (let i = 0; i < FX.burstCount; i++) {
      // Losowość czysto wizualna.
      const x = L.centerX + (Math.random() * 2 - 1) * halfWidth;
      const y = L.title.centerY + (Math.random() - 0.3) * 30;
      const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * 1.3;
      const speed = FX.burstSpeedMin + Math.random() * (FX.burstSpeedMax - FX.burstSpeedMin);
      const size = Math.random() < 0.6 ? 3 : 5;
      this.spawn(x, y, size, this.bloodColor(), {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      }, FX.burstLifeMs * (0.6 + Math.random() * 0.6), 0);
    }
  }

  private updateDrips(t: number): void {
    this.drips.forEach((drip, i) => {
      const released = dripsReleased(drip, t, DEATH_CRUMBLE.startAt);
      if (released <= (this.dripCounts[i] ?? 0)) return;
      this.dripCounts[i] = released;
      const { x, y } = this.blockScreen(drip.block);
      const px = x + this.blockSize / 2 - 1.5;
      const py = y + this.blockSize;
      this.spawn(px, py, 3, Math.random() < 0.5 ? P.eye0 : P.blood1, { x: px, y: py, vx: 0, vy: 0 }, FX.dripLifeMs, FX.dripSwellMs);
    });
  }

  private bloodColor(): number {
    return DEATH_BLOOD_COLORS[Math.floor(Math.random() * DEATH_BLOOD_COLORS.length)] ?? P.eye0;
  }

  private spawn(x: number, y: number, size: number, color: number, p: Particle, life: number, swellMs: number): void {
    const rect = this.scene.add.rectangle(x, y, size, size, color).setOrigin(0.5, 0);
    // Nad przyciemnieniem i napisem, pod tekstem tablicy.
    this.root.addAt(rect, this.root.getIndex(this.flash));
    this.particles.push({ rect, p, age: 0, life, swellMs });
  }

  private updateParticles(deltaMs: number): void {
    const height = this.scene.scale.height;
    this.particles = this.particles.filter((particle) => {
      particle.age += deltaMs;
      if (particle.age < particle.swellMs) {
        // Kropla nabrzmiewa w miejscu: rośnie w dół od krawędzi litery.
        particle.rect.setSize(3, 2 + Math.round((particle.age / particle.swellMs) * 4));
        return true;
      }
      particle.p = stepParticle(particle.p, deltaMs, FX.gravity);
      const fallAge = particle.age - particle.swellMs;
      const alpha = 1 - fallAge / particle.life;
      if (alpha <= 0 || particle.p.y > height) {
        particle.rect.destroy();
        return false;
      }
      // Pozycja na całe piksele — bez rozmycia.
      particle.rect.setPosition(Math.round(particle.p.x), Math.round(particle.p.y)).setAlpha(Math.min(1, alpha * 1.5));
      return true;
    });
  }

  // ——— dekoracje ———

  private buildOrnament(): Phaser.GameObjects.Container {
    const { width, gap } = L.ornament;
    const parts = [-1, 1].flatMap((side) => [
      this.scene.add.rectangle(side * gap, 0, 8, 8, P.eye0).setAngle(45),
      this.scene.add.rectangle(side * (gap + 8 + width / 2), 0, width, 4, P.chitin3),
    ]);
    parts.push(this.scene.add.rectangle(0, 0, 4, 4, P.eye1));
    return this.scene.add.container(L.centerX, L.ornament.y, parts);
  }

  /** Winieta: krawędzie ekranu w zakrzepłej krwi, środek czysty — gra prześwituje. */
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
    grad.addColorStop(0.45, 'rgba(62, 15, 20, 0)');
    grad.addColorStop(1, `rgba(62, 15, 20, ${L.vignetteAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
    ctx.restore();
    canvas.refresh();
    return VIGNETTE_TEXTURE;
  }
}
