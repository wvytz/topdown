import Phaser from 'phaser';
import { SceneKey } from '@/core/types';
import type { FloorSceneData } from '@/core/types';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config/gameConfig';
import { biomeForFloor } from '@/config/biomeConfig';
import type { ArtRect } from '@/config/splashConfig';
import {
  SPLASH_BACKDROP,
  SPLASH_BAT,
  SPLASH_EMBER_COLORS,
  SPLASH_EYES,
  SPLASH_EYES_LATE,
  SPLASH_LAYOUT as L,
  SPLASH_PALETTE as P,
  SPLASH_SACS,
  SPLASH_SPIDER,
  SPLASH_SPIDER_EYES,
  SPLASH_TIMING,
  SPLASH_TITLE_BANDS,
  SPLASH_WEBS,
} from '@/config/splashConfig';
import { pixelLine, pixelText } from '@/core/pixelArt';
import type { SplashFrame } from '@/systems/splashTimeline';
import { splashFadeStart, splashFrame, splashImpactAt } from '@/systems/splashTimeline';
import { BOOT_START_DATA_KEY, startFirstFloor } from '@/scenes/BootScene';

const GLOW_TEXTURE = 'splash-glow';
const VIGNETTE_TEXTURE = 'splash-vignette';
const SCANLINE_TEXTURE = 'splash-scanlines';

/**
 * Ekran startowy (krok 34): logo w stylu automatów na tle ruin wieży, przez ok. 2,8 s.
 * W tym czasie w tle ładuje się BootScene; tytuł trzyma się dłużej, jeśli ładowanie trwa.
 * Wszystko rysujemy prostokątami — ekran nie potrzebuje żadnych plików.
 */
export class SplashScene extends Phaser.Scene {
  private elapsed = 0;
  /** Czas pętli w chwili pierwszej klatki; liczymy od niego, a nie z sumy delt (te są wygładzane i przycinane). */
  private startTime: number | null = null;
  private fadeFrom: number | null = null;
  private skipRequested = false;
  private impactDone = false;
  private finished = false;

  private crawler!: Phaser.GameObjects.Container;
  private tower!: Phaser.GameObjects.Container;
  private subtitle!: Phaser.GameObjects.Text;
  private subtitleFull = '';
  private glow!: Phaser.GameObjects.Image;
  private eyes!: Phaser.GameObjects.Graphics;
  private lateEyes!: Phaser.GameObjects.Graphics;
  private spider!: Phaser.GameObjects.Graphics;
  private bat!: Phaser.GameObjects.Graphics;
  private sacs!: Phaser.GameObjects.Graphics;
  private flash!: Phaser.GameObjects.Rectangle;
  private blackout!: Phaser.GameObjects.Rectangle;

  constructor() {
    super(SceneKey.Splash);
  }

  create(): void {
    // Zasoby gry ładują się równolegle, pod ekranem startowym.
    this.scene.launch(SceneKey.Boot);
    this.cameras.main.setBackgroundColor(P.chitin0);

    this.drawBackdrop();
    this.glow = this.add.image(L.centerX, L.crawler.centerY, this.glowTexture()).setAlpha(0);
    this.addEmbers();
    this.tower = this.buildTowerTitle();
    this.crawler = this.buildCrawlerTitle();
    this.subtitle = this.buildSubtitle();
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, this.vignetteTexture());
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, this.scanlineTexture()).setOrigin(0);
    this.flash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, P.egg3).setOrigin(0).setAlpha(0);
    this.blackout = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, P.chitin0).setOrigin(0);

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
    const bootData = this.registry.get(BOOT_START_DATA_KEY) as FloorSceneData | undefined;
    this.fadeFrom = splashFadeStart({
      t: this.elapsed,
      fadeFrom: this.fadeFrom,
      bootReady: bootData !== undefined,
      skipRequested: this.skipRequested,
    });
    const frame = splashFrame(this.elapsed, this.fadeFrom);
    this.drawFrame(frame);

    if (!this.impactDone && this.elapsed >= splashImpactAt()) {
      this.impactDone = true;
      this.cameras.main.shake(SPLASH_TIMING.shakeDuration, SPLASH_TIMING.shakeIntensity);
    }
    if (frame.done && bootData) {
      this.finished = true;
      this.registry.remove(BOOT_START_DATA_KEY);
      startFirstFloor(this, bootData);
    }
  }

  private drawFrame(f: SplashFrame): void {
    this.blackout.setAlpha(f.blackout);
    this.flash.setAlpha(f.flashAlpha);
    // Poświata lekko „oddycha” jak płomień pochodni (efekt czysto wizualny).
    this.glow.setAlpha(f.glowAlpha * (0.85 + 0.15 * Math.sin(this.elapsed / 260)));
    this.crawler.setVisible(f.titleVisible).setScale(f.titleScale);
    this.tower.setAlpha(f.towerAlpha).setY(L.tower.top - f.towerOffsetY);
    this.subtitle.setText(this.subtitleFull.slice(0, f.subtitleChars));
    this.eyes.setVisible(f.eyesOn);
    this.lateEyes.setVisible(f.lateEyesOn);

    const dangle = L.spiderDangle;
    const phase = (this.elapsed % dangle.periodMs) / dangle.periodMs;
    const step = Math.floor(phase * dangle.steps) / dangle.steps;
    this.spider.setY(Math.round(dangle.px * (1 - Math.abs(1 - 2 * step))));
    this.bat.setY(Math.floor(this.elapsed / 600) % 2 === 0 ? 0 : -4);
    this.drawSacs(Math.floor(this.elapsed / L.primeBlinkMs) % 2 === 0 ? P.egg0 : P.egg2);
  }

  // ——— tło ———

  private drawBackdrop(): void {
    const g = this.add.graphics();
    this.fillRects(g, SPLASH_BACKDROP, L.artScale);
    g.fillStyle(P.chitin1);
    for (const [x0, y0, x1, y1] of SPLASH_WEBS) {
      for (const { x, y } of pixelLine(x0, y0, x1, y1)) g.fillRect(x * L.artScale, y * L.artScale, L.artScale, L.artScale);
    }

    this.spider = this.add.graphics();
    this.fillRects(this.spider, SPLASH_SPIDER, L.artScale);
    this.fillRects(this.spider, SPLASH_SPIDER_EYES, L.detailScale);
    this.bat = this.add.graphics();
    this.fillRects(this.bat, SPLASH_BAT, L.artScale);
    this.sacs = this.add.graphics();
    this.eyes = this.add.graphics();
    this.fillRects(this.eyes, SPLASH_EYES, L.detailScale);
    this.lateEyes = this.add.graphics();
    this.fillRects(this.lateEyes, SPLASH_EYES_LATE, L.detailScale);
  }

  private drawSacs(color: number): void {
    const s = L.detailScale;
    this.sacs.clear().fillStyle(color);
    for (const [x, y, w, h] of SPLASH_SACS) this.sacs.fillRect(x * s, y * s, w * s, h * s);
  }

  private fillRects(g: Phaser.GameObjects.Graphics, rects: readonly ArtRect[], scale: number): void {
    for (const [x, y, w, h, color] of rects) {
      g.fillStyle(color).fillRect(x * scale, y * scale, w * scale, h * scale);
    }
  }

  private addEmbers(): void {
    const e = L.embers;
    for (let i = 0; i < e.count; i++) {
      // Losowość czysto wizualna — Math.random jest tu dozwolone.
      const size = Math.random() < 0.5 ? 2 : 4;
      const x = Math.round((GAME_WIDTH * (i + 0.5 + (Math.random() - 0.5) * 0.6)) / e.count);
      const color = SPLASH_EMBER_COLORS[Math.floor(Math.random() * SPLASH_EMBER_COLORS.length)];
      const ember = this.add.rectangle(x, GAME_HEIGHT + size, size, size, color).setOrigin(0);
      const duration = Phaser.Math.Between(e.minDurationMs, e.maxDurationMs);
      this.tweens.add({
        targets: ember,
        y: GAME_HEIGHT - e.risePx,
        alpha: { from: 1, to: 0 },
        duration,
        delay: Math.random() * duration,
        repeat: -1,
      });
    }
  }

  // ——— napisy ———

  private buildTowerTitle(): Phaser.GameObjects.Container {
    const { unit, gap, ornamentWidth, ornamentGap } = L.tower;
    const text = pixelText('TOWER', gap);
    const w = text.width * unit;
    const h = text.height * unit;
    const g = this.add.graphics();
    const left = -w / 2;
    for (const [dy, color] of [[unit, P.outline], [0, P.bone1]] as const) {
      g.fillStyle(color);
      for (const { x, y } of text.cells) g.fillRect(left + x * unit, y * unit + dy, unit, unit);
    }
    // Ozdobniki: romb ognia i belka po obu stronach.
    const midY = h / 2;
    const ornaments = [-1, 1].flatMap((side) => {
      const inner = side * (w / 2 + ornamentGap);
      return [
        this.add.rectangle(inner + side * 4, midY, 8, 8, P.egg1).setAngle(45),
        this.add.rectangle(inner + side * (12 + ornamentWidth / 2), midY, ornamentWidth, 4, P.chitin3),
      ];
    });
    return this.add.container(L.centerX, L.tower.top, [g, ...ornaments]);
  }

  private buildCrawlerTitle(): Phaser.GameObjects.Container {
    const { unit, gap, extrude: e } = L.crawler;
    const text = pixelText('CRAWLER', gap);
    const left = (-text.width * unit) / 2;
    const top = (-text.height * unit) / 2;
    const g = this.add.graphics();
    const layer = (dx: number, dy: number, color: number): void => {
      g.fillStyle(color);
      for (const { x, y } of text.cells) g.fillRect(left + x * unit + dx, top + y * unit + dy, unit, unit);
    };
    // Wytłoczenie w dół (od najgłębszego cienia), obrys, ognista warga i lico w pasach ognia.
    layer(0, 5 * e, P.chitin0);
    layer(0, 4 * e, P.chitin1);
    layer(0, 3 * e, P.chitin2);
    layer(0, 2 * e, P.chitin3);
    for (const [dx, dy] of [[-e, 0], [e, 0], [0, -e], [-e, e], [e, e]] as const) layer(dx, dy, P.outline);
    layer(0, e, P.egg0);
    for (const { x, y } of text.cells) {
      g.fillStyle(SPLASH_TITLE_BANDS[y] ?? P.egg1).fillRect(left + x * unit, top + y * unit, unit, unit);
    }
    return this.add.container(L.centerX, L.crawler.centerY, [g]).setVisible(false);
  }

  private buildSubtitle(): Phaser.GameObjects.Text {
    const s = L.subtitle;
    this.subtitleFull = `— PIĘTRO 1 · ${biomeForFloor(1).name.toUpperCase()} —`;
    const text = this.add.text(0, s.y, this.subtitleFull, {
      fontFamily: 'monospace',
      fontSize: `${s.fontSize}px`,
      fontStyle: 'bold',
      color: '#9c8f74',
    });
    text.setLetterSpacing(s.letterSpacing);
    // Lewa krawędź stoi w miejscu, więc znaki dopisują się w prawo jak na automacie.
    text.setOrigin(0, 0.5).setX(Math.round(L.centerX - text.width / 2));
    text.setText('');
    return text;
  }

  // ——— tekstury z gradientem (poświata, winieta, linie CRT) ———

  private glowTexture(): string {
    const key = GLOW_TEXTURE;
    if (this.textures.exists(key)) return key;
    const { width, height, alpha } = L.glow;
    const canvas = this.textures.createCanvas(key, width, height);
    const ctx = canvas?.getContext();
    if (!canvas || !ctx) return key;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(1, height / width);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, width / 2);
    grad.addColorStop(0, `rgba(160, 51, 23, ${alpha})`);
    grad.addColorStop(0.6, `rgba(160, 51, 23, ${alpha / 3})`);
    grad.addColorStop(1, 'rgba(160, 51, 23, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-width / 2, -width / 2, width, width);
    ctx.restore();
    canvas.refresh();
    return key;
  }

  private vignetteTexture(): string {
    if (this.textures.exists(VIGNETTE_TEXTURE)) return VIGNETTE_TEXTURE;
    const canvas = this.textures.createCanvas(VIGNETTE_TEXTURE, GAME_WIDTH, GAME_HEIGHT);
    const ctx = canvas?.getContext();
    if (!canvas || !ctx) return VIGNETTE_TEXTURE;
    ctx.save();
    ctx.translate(GAME_WIDTH / 2, GAME_HEIGHT * 0.48);
    ctx.scale(1, GAME_HEIGHT / GAME_WIDTH);
    const r = GAME_WIDTH * 0.72;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0.5, 'rgba(15, 14, 24, 0)');
    grad.addColorStop(1, `rgba(15, 14, 24, ${L.vignetteAlpha})`);
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
