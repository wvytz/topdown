import Phaser from 'phaser';
import { SceneKey } from '@/core/types';
import type { FloorSceneData } from '@/core/types';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import type { ArtLine, ArtRect } from '@/config/splashConfig';
import {
  SPLASH_ASH_COLORS,
  SPLASH_BACKDROP,
  SPLASH_DEBRIS_SOURCE,
  SPLASH_EYES,
  SPLASH_EYES_LATE,
  SPLASH_FIRES,
  SPLASH_GROUND_CRACKS,
  SPLASH_LAYOUT as L,
  SPLASH_PALETTE as P,
  SPLASH_TIMING,
  SPLASH_TITLE_BANDS,
  SPLASH_TITLE_LINES,
  SPLASH_TOWER_CRACKS,
} from '@/config/splashConfig';
import { pixelDisc, pixelLine, pixelRing, pixelText } from '@/core/pixelArt';
import type { SplashFrame } from '@/systems/splashTimeline';
import { splashFadeStart, splashFrame, splashImpacts } from '@/systems/splashTimeline';
import type { Particle } from '@/systems/deathScreen';
import { stepParticle } from '@/systems/deathScreen';
import { BOOT_START_DATA_KEY, startFirstFloor } from '@/scenes/BootScene';

const GLOW_TEXTURE = 'splash-glow';
const VIGNETTE_TEXTURE = 'splash-vignette';
const SCANLINE_TEXTURE = 'splash-scanlines';
/** Głębokości warstw: świat (tło, popiół, odłamki) pod napisem i nakładkami. */
const DEPTH = { debris: 1, title: 10, vignette: 11, scanlines: 12, flash: 13, blackout: 14 } as const;

/** Płatek popiołu: opada i kołysze się na boki. */
interface Ash {
  readonly rect: Phaser.GameObjects.Rectangle;
  readonly speed: number;
  readonly baseX: number;
  readonly phase: number;
  y: number;
}

/** Odłamek wieży albo obłoczek pyłu. */
interface Debris {
  readonly rect: Phaser.GameObjects.Rectangle;
  p: Particle;
  age: number;
  /** null = spada do ziemi i znika; liczba = pył, gaśnie po tylu ms. */
  readonly lifeMs: number | null;
}

/**
 * Ekran startowy (krok 34; motyw z kroku 52): samotna wieża w mroku i zniszczeniu, za nią zaćmione słońce,
 * z nieba opada popiół. TOP uderza nad szczytem wieży, DOWN — ciężej — u jej podstawy; od wieży odpadają kamienie,
 * a pęknięcia w ziemi zaczynają się żarzyć. W tym czasie w tle ładuje się BootScene.
 * Wszystko rysujemy prostokątami — ekran nie potrzebuje żadnych plików.
 */
export class SplashScene extends Phaser.Scene {
  private elapsed = 0;
  /** Czas pętli w chwili pierwszej klatki; liczymy od niego, a nie z sumy delt (te są wygładzane i przycinane). */
  private startTime: number | null = null;
  private lastFrameAt = 0;
  private fadeFrom: number | null = null;
  private skipRequested = false;
  /** Ile uderzeń już obsłużono (wstrząs, odłamki, pył). */
  private impactsDone = 0;
  private nextDribbleAt = 0;
  private finished = false;

  private words: Phaser.GameObjects.Container[] = [];
  private corona!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Image;
  private cracks!: Phaser.GameObjects.Graphics;
  private fires!: Phaser.GameObjects.Graphics;
  private eyes!: Phaser.GameObjects.Graphics;
  private lateEyes!: Phaser.GameObjects.Graphics;
  private flash!: Phaser.GameObjects.Rectangle;
  private blackout!: Phaser.GameObjects.Rectangle;
  private ash: Ash[] = [];
  private debris: Debris[] = [];

  constructor() {
    super(SceneKey.Splash);
  }

  create(): void {
    // Zasoby gry ładują się równolegle, pod ekranem startowym.
    this.scene.launch(SceneKey.Boot);
    this.cameras.main.setBackgroundColor(P.chitin0);

    this.drawEclipse();
    this.drawBackdrop();
    this.addAsh();
    this.words = this.buildTitle();
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, this.vignetteTexture()).setDepth(DEPTH.vignette);
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, this.scanlineTexture()).setOrigin(0).setDepth(DEPTH.scanlines);
    this.flash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, P.bone2).setOrigin(0).setAlpha(0).setDepth(DEPTH.flash);
    this.blackout = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, P.chitin0).setOrigin(0).setDepth(DEPTH.blackout);

    const skip = (): void => {
      this.skipRequested = true;
    };
    this.input.keyboard?.on('keydown', skip);
    this.input.on('pointerdown', skip);
    // Tylko w trybie dev: `?nosplash` pomija ekran (szybkie testy).
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('nosplash')) skip();

    this.drawFrame(splashFrame(0, null));
  }

  override update(time: number): void {
    if (this.finished) return;
    this.startTime ??= time;
    this.elapsed = time - this.startTime;
    const dt = Math.min(50, Math.max(0, this.elapsed - this.lastFrameAt));
    this.lastFrameAt = this.elapsed;

    const bootData = this.registry.get(BOOT_START_DATA_KEY) as FloorSceneData | undefined;
    this.fadeFrom = splashFadeStart({
      t: this.elapsed,
      fadeFrom: this.fadeFrom,
      bootReady: bootData !== undefined,
      skipRequested: this.skipRequested,
    });
    const frame = splashFrame(this.elapsed, this.fadeFrom);
    this.drawFrame(frame);
    this.handleImpacts();
    this.updateAsh(dt);
    this.updateDebris(dt);

    if (frame.done && bootData) {
      this.finished = true;
      this.registry.remove(BOOT_START_DATA_KEY);
      startFirstFloor(this, bootData);
    }
  }

  private drawFrame(f: SplashFrame): void {
    this.blackout.setAlpha(f.blackout);
    this.flash.setAlpha(f.flashAlpha);
    // Korona i poświata lekko pulsują jak dogasający żar (efekt czysto wizualny).
    const ember = 0.88 + 0.12 * Math.sin(this.elapsed / 420);
    this.corona.setAlpha(f.coronaAlpha * ember);
    this.glow.setAlpha(f.coronaAlpha * ember);
    this.cracks.setAlpha(f.cracksAlpha * (0.75 + 0.25 * Math.sin(this.elapsed / 300)));
    this.words.forEach((word, i) => {
      const state = f.words[i];
      word.setVisible(state?.visible ?? false).setScale(state?.scale ?? 1);
    });
    this.eyes.setVisible(f.eyesOn);
    this.lateEyes.setVisible(f.lateEyesOn);
    // Dalekie pożary migoczą (co ok. 120 ms nowa jasność; czysto wizualne).
    if (Math.floor(this.elapsed / 120) !== Math.floor((this.elapsed - 16) / 120)) this.fires.setAlpha(0.55 + Math.random() * 0.45);
  }

  /** Każde uderzenie: wstrząs i odłamki z wieży; ostatnie (DOWN w ziemię) dodatkowo pył. */
  private handleImpacts(): void {
    const impacts = splashImpacts();
    const next = impacts[this.impactsDone];
    if (next !== undefined && this.elapsed >= next) {
      const i = this.impactsDone++;
      this.cameras.main.shake(SPLASH_TIMING.shakeDuration[i] ?? 0, SPLASH_TIMING.shakeIntensity[i] ?? 0, true);
      for (let k = 0; k < (L.debris.perImpact[i] ?? 0); k++) this.spawnStone();
      if (i === impacts.length - 1) this.spawnDust();
      this.nextDribbleAt = this.elapsed + L.debris.dribbleMs;
    }
    // Po pierwszym uderzeniu wieża dalej się sypie — pojedyncze kamienie co jakiś czas.
    if (this.impactsDone > 0 && this.elapsed >= this.nextDribbleAt) {
      this.spawnStone();
      this.nextDribbleAt = this.elapsed + L.debris.dribbleMs * (0.6 + Math.random() * 0.8);
    }
  }

  // ——— tło ———

  private drawEclipse(): void {
    const { cx, cy, radius } = L.eclipse;
    const s = L.artScale;
    const x0 = cx * s;
    const y0 = cy * s;
    this.glow = this.add.image(x0 + s / 2, y0 + s / 2, this.glowTexture()).setBlendMode(Phaser.BlendModes.ADD);
    this.corona = this.add.graphics();
    const ring = (r: number, color: number): void => {
      this.corona.fillStyle(color);
      for (const { x, y } of pixelRing(r)) this.corona.fillRect(x0 + x * s, y0 + y * s, s, s);
    };
    ring(radius + 2, P.eye0);
    ring(radius + 1, P.egg0);
    ring(radius, P.egg2);
    // Czarna tarcza zasłania słońce — rysowana na koronie.
    this.corona.fillStyle(P.void);
    for (const { x, y } of pixelDisc(radius - 0.5)) this.corona.fillRect(x0 + x * s, y0 + y * s, s, s);
  }

  private drawBackdrop(): void {
    const g = this.add.graphics();
    this.fillRects(g, SPLASH_BACKDROP, L.artScale);
    this.drawLines(g, SPLASH_TOWER_CRACKS, P.chitin0);

    this.fires = this.add.graphics();
    this.fillRects(this.fires, SPLASH_FIRES, L.detailScale);
    this.cracks = this.add.graphics();
    this.drawLines(this.cracks, SPLASH_GROUND_CRACKS, P.egg0);
    this.eyes = this.add.graphics();
    this.fillRects(this.eyes, SPLASH_EYES, L.detailScale);
    this.lateEyes = this.add.graphics();
    this.fillRects(this.lateEyes, SPLASH_EYES_LATE, L.detailScale);
  }

  private drawLines(g: Phaser.GameObjects.Graphics, lines: readonly ArtLine[], color: number): void {
    const s = L.artScale;
    g.fillStyle(color);
    for (const [x0, y0, x1, y1] of lines) {
      for (const { x, y } of pixelLine(x0, y0, x1, y1)) g.fillRect(x * s, y * s, s, s);
    }
  }

  private fillRects(g: Phaser.GameObjects.Graphics, rects: readonly ArtRect[], scale: number): void {
    for (const [x, y, w, h, color] of rects) {
      g.fillStyle(color).fillRect(x * scale, y * scale, w * scale, h * scale);
    }
  }

  // ——— popiół i odłamki (losowość czysto wizualna) ———

  private addAsh(): void {
    const a = L.ash;
    for (let i = 0; i < a.count; i++) {
      const size = Math.random() < 0.7 ? 2 : 4;
      const color = SPLASH_ASH_COLORS[Math.floor(Math.random() * SPLASH_ASH_COLORS.length)] ?? P.bone0;
      const baseX = Math.random() * GAME_WIDTH;
      const y = Math.random() * GAME_HEIGHT;
      const rect = this.add.rectangle(baseX, y, size, size, color).setAlpha(0.35 + Math.random() * 0.4);
      this.ash.push({ rect, baseX, y, speed: a.minSpeed + Math.random() * (a.maxSpeed - a.minSpeed), phase: Math.random() * Math.PI * 2 });
    }
  }

  private updateAsh(dt: number): void {
    const a = L.ash;
    for (const flake of this.ash) {
      flake.y += flake.speed * dt;
      if (flake.y > GAME_HEIGHT + 4) flake.y = -4;
      const sway = Math.sin((this.elapsed / a.swayPeriodMs) * Math.PI * 2 + flake.phase) * a.sway;
      flake.rect.setPosition(Math.round(flake.baseX + sway), Math.round(flake.y));
    }
  }

  private spawnStone(): void {
    const s = L.artScale;
    const src = SPLASH_DEBRIS_SOURCE;
    const x = (src.x0 + Math.random() * (src.x1 - src.x0)) * s;
    const y = (src.y0 + Math.random() * (src.y1 - src.y0)) * s;
    const size = (L.debris.minSize + Math.floor(Math.random() * (L.debris.maxSize - L.debris.minSize + 1))) * s;
    const color = Math.random() < 0.5 ? P.chitin1 : P.chitin2;
    // Kamienie należą do świata: przed wieżą, ale pod napisem i winietą.
    const rect = this.add.rectangle(x, y, size, size, color).setOrigin(0).setDepth(DEPTH.debris);
    this.debris.push({ rect, p: { x, y, vx: 0.01 + Math.random() * 0.04, vy: -0.02 * Math.random() }, age: 0, lifeMs: null });
  }

  private spawnDust(): void {
    const d = L.dust;
    for (let i = 0; i < d.count; i++) {
      const x = L.centerX + (Math.random() * 2 - 1) * 220;
      const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * 1.2;
      const speed = d.speed * (0.4 + Math.random());
      const color = Math.random() < 0.5 ? P.chitin2 : P.chitin3;
      const rect = this.add.rectangle(x, d.y, 4, 4, color).setOrigin(0).setDepth(DEPTH.debris);
      this.debris.push({ rect, p: { x, y: d.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed }, age: 0, lifeMs: d.lifeMs });
    }
  }

  private updateDebris(dt: number): void {
    this.debris = this.debris.filter((piece) => {
      piece.age += dt;
      piece.p = stepParticle(piece.p, dt, L.debris.gravity * (piece.lifeMs === null ? 1 : 0.3));
      const gone = piece.lifeMs === null ? piece.p.y >= L.debris.groundY : piece.age >= piece.lifeMs;
      if (gone) {
        piece.rect.destroy();
        return false;
      }
      piece.rect.setPosition(Math.round(piece.p.x), Math.round(piece.p.y));
      if (piece.lifeMs !== null) piece.rect.setAlpha(1 - piece.age / piece.lifeMs);
      return true;
    });
  }

  // ——— napis ———

  /** TOP i DOWN: każda linia we własnym kontenerze (uderzają osobno), litery z popiołu i kości. */
  private buildTitle(): Phaser.GameObjects.Container[] {
    const { unit, gap, extrude: e } = L.title;
    return SPLASH_TITLE_LINES.map(({ text: word, centerY }) => {
      const text = pixelText(word, gap);
      const left = (-text.width * unit) / 2;
      const top = (-text.height * unit) / 2;
      const g = this.add.graphics();
      const layer = (dx: number, dy: number, color: number): void => {
        g.fillStyle(color);
        for (const { x, y } of text.cells) g.fillRect(left + x * unit + dx, top + y * unit + dy, unit, unit);
      };
      // Głębokie wytłoczenie w mrok, obrys, żarząca się krawędź i lico z popiołu.
      layer(0, 6 * e, P.void);
      layer(0, 5 * e, P.chitin0);
      layer(0, 4 * e, P.chitin1);
      layer(0, 3 * e, P.chitin1);
      layer(0, 2 * e, P.chitin2);
      for (const [dx, dy] of [[-e, 0], [e, 0], [0, -e], [-e, e], [e, e]] as const) layer(dx, dy, P.outline);
      layer(0, e, P.egg0);
      for (const { x, y } of text.cells) {
        g.fillStyle(SPLASH_TITLE_BANDS[y] ?? P.bone0).fillRect(left + x * unit, top + y * unit, unit, unit);
      }
      return this.add.container(L.centerX, centerY, [g]).setVisible(false).setDepth(DEPTH.title);
    });
  }

  // ——— tekstury z gradientem (poświata korony, winieta, linie CRT) ———

  private glowTexture(): string {
    if (this.textures.exists(GLOW_TEXTURE)) return GLOW_TEXTURE;
    const { size, alpha } = L.glow;
    const canvas = this.textures.createCanvas(GLOW_TEXTURE, size, size);
    const ctx = canvas?.getContext();
    if (!canvas || !ctx) return GLOW_TEXTURE;
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0.2, `rgba(160, 51, 23, ${alpha})`);
    grad.addColorStop(0.45, `rgba(176, 42, 45, ${alpha * 0.45})`);
    grad.addColorStop(1, 'rgba(176, 42, 45, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    canvas.refresh();
    return GLOW_TEXTURE;
  }

  private vignetteTexture(): string {
    if (this.textures.exists(VIGNETTE_TEXTURE)) return VIGNETTE_TEXTURE;
    const canvas = this.textures.createCanvas(VIGNETTE_TEXTURE, GAME_WIDTH, GAME_HEIGHT);
    const ctx = canvas?.getContext();
    if (!canvas || !ctx) return VIGNETTE_TEXTURE;
    ctx.save();
    ctx.translate(GAME_WIDTH / 2, GAME_HEIGHT * 0.5);
    ctx.scale(1, GAME_HEIGHT / GAME_WIDTH);
    const r = GAME_WIDTH * 0.62;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0.35, 'rgba(15, 14, 24, 0)');
    grad.addColorStop(1, `rgba(7, 6, 11, ${L.vignetteAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
    ctx.restore();
    canvas.refresh();
    return VIGNETTE_TEXTURE;
  }

  private scanlineTexture(): string {
    if (this.textures.exists(SCANLINE_TEXTURE)) return SCANLINE_TEXTURE;
    const canvas = this.textures.createCanvas(SCANLINE_TEXTURE, 4, 4);
    const ctx = canvas?.getContext();
    if (!canvas || !ctx) return SCANLINE_TEXTURE;
    ctx.fillStyle = `rgba(15, 14, 24, ${L.scanlineAlpha})`;
    ctx.fillRect(0, 2, 4, 2);
    canvas.refresh();
    return SCANLINE_TEXTURE;
  }
}
